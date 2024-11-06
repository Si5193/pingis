// Firebase configuration
const firebaseConfig = {
    apiKey: "AIzaSyBtcoZ4KCrLGIeJwUGHEEXGMatS5PERUuI",
    authDomain: "pingis-150ec.firebaseapp.com",
    projectId: "pingis-150ec",
    storageBucket: "pingis-150ec.firebasestorage.app",
    messagingSenderId: "696129105660",
    appId: "1:696129105660:web:e90a4803296c3e7b9bb179"
};

// Initialize Firebase
firebase.initializeApp(firebaseConfig);

// Get Firebase services
const auth = firebase.auth();
const db = firebase.firestore();

// DOM Elements
const loginSection = document.getElementById('loginSection');
const gameSection = document.getElementById('gameSection');
const loginBtn = document.getElementById('loginBtn');
const logoutBtn = document.getElementById('logoutBtn');
const playerName = document.getElementById('playerName');
const playerPoints = document.getElementById('playerPoints');
const playerRank = document.getElementById('playerRank');
const submitResults = document.getElementById('submitResults');
const rankingBody = document.getElementById('rankingBody');
const loginError = document.getElementById('loginError');

// Current user data
let currentUser = null;
let currentUserData = null;

// Auth state observer
auth.onAuthStateChanged(async (user) => {
    try {
        if (user) {
            currentUser = user;
            loginSection.classList.add('hidden');
            gameSection.classList.remove('hidden');
            await fetchUserData();
            startRealtimeUpdates();
        } else {
            loginSection.classList.remove('hidden');
            gameSection.classList.add('hidden');
            currentUser = null;
            currentUserData = null;
            stopRealtimeUpdates();
        }
    } catch (error) {
        console.error('Auth state change error:', error);
        showNotification('Ett fel uppstod vid inloggning', 'error');
    }
});

// Realtime updates
let unsubscribeRanking = null;

function startRealtimeUpdates() {
    unsubscribeRanking = db.collection('players')
        .orderBy('points', 'desc')
        .onSnapshot(snapshot => {
            updateRankingTableFromSnapshot(snapshot);
        }, error => {
            console.error("Realtime update error:", error);
        });
}

function stopRealtimeUpdates() {
    if (unsubscribeRanking) {
        unsubscribeRanking();
    }
}

// Login functionality
loginBtn.addEventListener('click', async () => {
    const email = document.getElementById('email').value;
    const password = document.getElementById('password').value;
    
    if (!email || !password) {
        showNotification('Vänligen fyll i både email och lösenord', 'error');
        return;
    }
    
    try {
        await auth.signInWithEmailAndPassword(email, password);
        loginError.textContent = '';
        showNotification('Inloggning lyckades!', 'success');
    } catch (error) {
        console.error('Login error:', error);
        loginError.textContent = 'Fel vid inloggning: ' + error.message;
        showNotification('Inloggning misslyckades', 'error');
    }
});

// Fetch user data with auto-creation if needed
async function fetchUserData() {
    try {
        const querySnapshot = await db.collection('players')
            .where('email', '==', currentUser.email)
            .get();

        if (querySnapshot.empty) {
            // Create new player if doesn't exist
            const newPlayerData = {
                name: currentUser.email.split('@')[0], // Use first part of email as name
                email: currentUser.email,
                points: 0,
                wins: 0,
                losses: 0,
                trend: 0,
                lastUpdated: firebase.firestore.FieldValue.serverTimestamp()
            };

            const docRef = await db.collection('players').add(newPlayerData);
            currentUserData = { id: docRef.id, ...newPlayerData };
            showNotification('Ny spelare skapad!', 'success');
        } else {
            const playerDoc = querySnapshot.docs[0];
            currentUserData = { id: playerDoc.id, ...playerDoc.data() };
        }

        // Update UI
        playerName.textContent = currentUserData.name;
        playerPoints.textContent = currentUserData.points || 0;
    } catch (error) {
        console.error('Error fetching/creating user data:', error);
        showNotification('Ett fel uppstod vid hämtning av användardata', 'error');
    }
}

// Update player rank
function updatePlayerRank() {
    const allRows = rankingBody.getElementsByTagName('tr');
    for (let i = 0; i < allRows.length; i++) {
        if (allRows[i].classList.contains('highlight')) {
            playerRank.textContent = `#${i + 1}`;
            break;
        }
    }
}

// Adjust value buttons functionality
window.adjustValue = function(fieldId, change) {
    const input = document.getElementById(fieldId);
    const currentValue = parseInt(input.value) || 0;
    const newValue = Math.max(0, currentValue + change);
    input.value = newValue;
};

// Submit results
submitResults.addEventListener('click', async () => {
    const wins = parseInt(document.getElementById('wins').value) || 0;
    const losses = parseInt(document.getElementById('losses').value) || 0;
    
    if (wins < 0 || losses < 0) {
        showNotification('Vänligen ange positiva tal', 'error');
        return;
    }

    if (wins === 0 && losses === 0) {
        showNotification('Ange minst en vinst eller förlust', 'error');
        return;
    }

    if (!currentUser) {
        showNotification('Du måste vara inloggad', 'error');
        return;
    }

    try {
        if (!currentUserData) {
            await fetchUserData();
        }

        // Calculate new points (2 points per win, -1 point per loss)
        const newPoints = (wins * 2) - losses;
        const currentPoints = currentUserData.points || 0;
        
        // Update player statistics
        const playerRef = db.collection('players').doc(currentUserData.id);
        await playerRef.update({
            points: currentPoints + newPoints,
            wins: firebase.firestore.FieldValue.increment(wins),
            losses: firebase.firestore.FieldValue.increment(losses),
            lastUpdated: firebase.firestore.FieldValue.serverTimestamp(),
            trend: newPoints
        });
        
        // Update local user data
        currentUserData.points = currentPoints + newPoints;
        currentUserData.wins = (currentUserData.wins || 0) + wins;
        currentUserData.losses = (currentUserData.losses || 0) + losses;
        
        // Update UI
        playerPoints.textContent = currentUserData.points;
        
        // Reset form
        document.getElementById('wins').value = '0';
        document.getElementById('losses').value = '0';
        
        showNotification('Resultat registrerat!', 'success');
    } catch (error) {
        console.error('Error submitting results:', error);
        showNotification('Ett fel uppstod vid registrering av resultaten', 'error');
    }
});

// Update ranking table from snapshot
function updateRankingTableFromSnapshot(snapshot) {
    const allPlayers = snapshot.docs.map(doc => {
        const data = doc.data();
        const totalGames = (data.wins || 0) + (data.losses || 0);
        const winPercentage = totalGames > 0 
            ? ((data.wins || 0) / totalGames * 100).toFixed(1) 
            : "0.0";
        
        return {
            id: doc.id,
            ...data,
            winPercentage
        };
    });

    // Update table
    rankingBody.innerHTML = '';
    allPlayers.forEach((player, index) => {
        const row = document.createElement('tr');
        if (currentUser && player.email === currentUser.email) {
            row.classList.add('highlight');
        }

        // Create trend icon based on latest point change
        const trendIcon = getTrendIcon(player.trend || 0);
        
        row.innerHTML = `
            <td>${index + 1}</td>
            <td>
                <div class="player-info">
                    ${player.name}
                </div>
            </td>
            <td>${player.points || 0}</td>
            <td>${player.wins || 0}/${player.losses || 0}</td>
            <td>${player.winPercentage}%</td>
            <td>${trendIcon}</td>
        `;
        rankingBody.appendChild(row);
    });

    updatePlayerRank();
}

// Get trend icon based on point change
function getTrendIcon(trend) {
    if (trend > 0) {
        return '<div class="trend trend-up"><i class="fas fa-arrow-up"></i></div>';
    } else if (trend < 0) {
        return '<div class="trend trend-down"><i class="fas fa-arrow-down"></i></div>';
    }
    return '<div class="trend trend-neutral"><i class="fas fa-minus"></i></div>';
}

// Show notification
function showNotification(message, type) {
    // Create notification element if it doesn't exist
    let notification = document.querySelector('.notification');
    if (!notification) {
        notification = document.createElement('div');
        notification.className = 'notification';
        document.body.appendChild(notification);
    }

    // Set message and style
    notification.textContent = message;
    notification.className = `notification ${type}`;
    
    // Show notification
    notification.style.display = 'block';
    
    // Hide after 3 seconds
    setTimeout(() => {
        notification.style.display = 'none';
    }, 3000);
}

// Logout functionality
logoutBtn.addEventListener('click', () => {
    auth.signOut()
        .then(() => {
            showNotification('Du har loggat ut', 'success');
        })
        .catch((error) => {
            console.error('Logout error:', error);
            showNotification('Ett fel uppstod vid utloggning', 'error');
        });
});

// Add notification styles
const style = document.createElement('style');
style.textContent = `
.notification {
    position: fixed;
    top: 20px;
    right: 20px;
    padding: 15px 25px;
    border-radius: 5px;
    color: white;
    font-weight: 500;
    display: none;
    z-index: 1000;
    animation: slideIn 0.3s ease-out;
}

.notification.success {
    background-color: var(--success-color);
}

.notification.error {
    background-color: var(--danger-color);
}

@keyframes slideIn {
    from {
        transform: translateX(100%);
        opacity: 0;
    }
    to {
        transform: translateX(0);
        opacity: 1;
    }
}
`;
document.head.appendChild(style);
