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

// Realtime updates
let unsubscribeRanking = null;

// Auth state observer
auth.onAuthStateChanged(async (user) => {
    try {
        if (user) {
            currentUser = user;
            loginSection.classList.add('hidden');
            gameSection.classList.remove('hidden');
            await fetchUserData();
            updateNextMatch();
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

// Realtime updates management
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
                name: currentUser.email.split('@')[0],
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
        const winPoints = wins * 2;
        const lossPoints = losses;
        const currentPoints = currentUserData.points || 0;
        
        // Ensure points don't go below 0
        const newPoints = Math.max(0, currentPoints + winPoints - lossPoints);
        const pointChange = newPoints - currentPoints;
        
        // Update player statistics
        const playerRef = db.collection('players').doc(currentUserData.id);
        await playerRef.update({
            points: newPoints,
            wins: firebase.firestore.FieldValue.increment(wins),
            losses: firebase.firestore.FieldValue.increment(losses),
            lastUpdated: firebase.firestore.FieldValue.serverTimestamp(),
            trend: pointChange // This will show the actual point change
        });
        
        // Update local user data
        currentUserData.points = newPoints;
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

// Get trend icon
function getTrendIcon(trend) {
    if (trend > 0) {
        return '<div class="trend trend-up"><i class="fas fa-arrow-up"></i></div>';
    } else if (trend < 0) {
        return '<div class="trend trend-down"><i class="fas fa-arrow-down"></i></div>';
    }
    return '<div class="trend trend-neutral"><i class="fas fa-minus"></i></div>';
}

// Svedbergs GIF matcher
const matches = [
    {
        date: '2024-01-11',
        time: '13:30',
        homeTeam: 'Kågeröds BTK F',
        awayTeam: 'Svedbergs GIF B',
        location: 'Löddenäshallen, Apotekarevägen 4 Bjärred'
    },
    {
        date: '2024-01-11',
        time: '16:00',
        homeTeam: 'Svedbergs GIF B',
        awayTeam: 'Åstorps BTK E',
        location: 'Löddenäshallen, Apotekarevägen 4 Bjärred'
    },
    {
        date: '2024-02-02',
        time: '10:00',
        homeTeam: 'Kågeröds BTK G',
        awayTeam: 'Svedbergs GIF B',
        location: 'Bordtennishallen, Böketoftavägen 5, 268 77 Kågeröd'
    },
    {
        date: '2024-02-02',
        time: '13:00',
        homeTeam: 'Svedbergs GIF B',
        awayTeam: 'Bjärreds BTK C',
        location: 'Bordtennishallen, Böketoftavägen 5, 268 77 Kågeröd'
    },
    {
        date: '2024-03-15',
        time: '10:00',
        homeTeam: 'BTK Scania C',
        awayTeam: 'Svedbergs GIF B',
        location: 'Bordtennishallen, Böketoftavägen 5, 268 77 Kågeröd'
    },
    {
        date: '2024-03-15',
        time: '13:00',
        homeTeam: 'Svedbergs GIF B',
        awayTeam: 'IFK Lund F1',
        location: 'Bordtennishallen, Böketoftavägen 5, 268 77 Kågeröd'
    },
    {
        date: '2024-04-12',
        time: '10:00',
        homeTeam: 'Klippans BTK C',
        awayTeam: 'Svedbergs GIF B',
        location: 'Rågenhallen, Hagagatan 1 Åstorp'
    },
    {
        date: '2024-04-12',
        time: '12:30',
        homeTeam: 'Svedbergs GIF B',
        awayTeam: 'Kågeröds BTK F',
        location: 'Rågenhallen, Hagagatan 1 Åstorp'
    }
];

// Funktion för att hitta nästa match
function findNextMatch() {
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    
    return matches.find(match => {
        const [year, month, day] = match.date.split('-');
        const [hours, minutes] = match.time.split(':');
        const matchDateTime = new Date(year, month - 1, day, hours, minutes);
        return matchDateTime >= now;
    });
}

// Funktion för att formatera datum
function formatDate(date, time) {
    const [year, month, day] = date.split('-');
    const matchDate = new Date(year, month - 1, day);
    const weekday = matchDate.toLocaleDateString('sv-SE', { weekday: 'long' });
    return `${weekday} ${day}/${month}`;
}

// Uppdatera nästa match i UI
function updateNextMatch() {
    const nextMatch = findNextMatch();
    const nextMatchElement = document.getElementById('nextMatch');
    
    if (nextMatch) {
        nextMatchElement.innerHTML = `
            <div class="match-time">
                <i class="fas fa-calendar"></i>
                Nästa match
            </div>
            <div class="match-teams">
                <span class="${nextMatch.homeTeam.includes('Svedbergs') ? 'team-highlight' : 'team-name'}">${nextMatch.homeTeam}</span>
                <span class="vs">vs</span>
                <span class="${nextMatch.awayTeam.includes('Svedbergs') ? 'team-highlight' : 'team-name'}">${nextMatch.awayTeam}</span>
            </div>
            <div class="match-info">
                <i class="fas fa-clock"></i>
                ${formatDate(nextMatch.date, nextMatch.time)} ${nextMatch.time}
            </div>
            <div class="match-location">
                <a href="https://maps.google.com/?q=${encodeURIComponent(nextMatch.location)}" 
                   target="_blank" 
                   class="location-link">
                    <i class="fas fa-map-marker-alt"></i>
                    ${nextMatch.location}
                </a>
            </div>
        `;
    } else {
        nextMatchElement.innerHTML = `
            <div class="no-matches">
                <i class="fas fa-calendar-xmark"></i>
                Inga fler schemalagda matcher denna säsong
            </div>
        `;
    }
    updateAllMatches();
}

// Uppdatera listan med alla matcher
function updateAllMatches() {
    const allMatchesElement = document.getElementById('allMatches');
    const now = new Date();
    now.setHours(0, 0, 0, 0);
    
    allMatchesElement.innerHTML = matches
        .sort((a, b) => {
            const dateA = new Date(a.date + ' ' + a.time);
            const dateB = new Date(b.date + ' ' + b.time);
            return dateA - dateB;
        })
        .map(match => {
            const [year, month, day] = match.date.split('-');
            const [hours, minutes] = match.time.split(':');
            const matchDateTime = new Date(year, month - 1, day, hours, minutes);
            const isPast = matchDateTime < now;
            
            return `
                <div class="match-item ${isPast ? 'past-match' : 'upcoming-match'}">
                    <div class="match-date">
                        <i class="fas fa-calendar"></i>
                        ${formatDate(match.date, match.time)}
                    </div>
                    <div class="match-teams">
                        <span class="${match.homeTeam.includes('Svedbergs') ? 'team-highlight' : ''}">${match.homeTeam}</span>
                        vs
                        <span class="${match.awayTeam.includes('Svedbergs') ? 'team-highlight' : ''}">${match.awayTeam}</span>
                    </div>
                    <div class="match-time">
                        <i class="fas fa-clock"></i>
                        ${match.time}
                    </div>
                    <div class="match-location">
                        <a href="https://maps.google.com/?q=${encodeURIComponent(match.location)}" 
                           target="_blank" 
                           class="location-link small">
                            <i class="fas fa-map-marker-alt"></i>
                            ${match.location}
                        </a>
                    </div>
                </div>
            `;
        })
        .join('');
}

// Toggle visa/dölja alla matcher
document.getElementById('toggleMatches')?.addEventListener('click', function() {
    const allMatches = document.getElementById('allMatches');
    const icon = this.querySelector('i');
    const text = this.querySelector('span');
    
    if (allMatches.classList.contains('hidden')) {
        allMatches.classList.remove('hidden');
        icon.classList.replace('fa-chevron-down', 'fa-chevron-up');
        text.textContent = 'Dölj matcher';
    } else {
        allMatches.classList.add('hidden');
        icon.classList.replace('fa-chevron-up', 'fa-chevron-down');
        text.textContent = 'Visa alla matcher';
    }
});

// Show notification
function showNotification(message, type) {
    let notification = document.querySelector('.notification');
    if (!notification) {
        notification = document.createElement('div');
        notification.className = 'notification';
        document.body.appendChild(notification);
    }

    notification.textContent = message;
    notification.className = `notification ${type}`;
    notification.style.display = 'block';
    
    setTimeout(() => {
        notification.style.display = 'none';
    }, 3000);
}

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

// Initialize page
document.addEventListener('DOMContentLoaded', () => {
    // Add completed matches
    const completedMatches = [
        {
            date: '2024-01-11',
            time: '13:30',
            homeTeam: 'Kågeröds BTK F',
            awayTeam: 'Svedbergs GIF B',
            location: 'Löddenäshallen, Apotekarevägen 4 Bjärred'
        },
        {
            date: '2024-01-11',
            time: '16:00',
            homeTeam: 'Svedbergs GIF B',
            awayTeam: 'Åstorps BTK E',
            location: 'Löddenäshallen, Apotekarevägen 4 Bjärred'
        }
    ];

    // Combine completed and upcoming matches
    matches.push(...completedMatches);
    
    // Sort all matches by date and time
    matches.sort((a, b) => {
        const dateA = new Date(`${a.date} ${a.time}`);
        const dateB = new Date(`${b.date} ${b.time}`);
        return dateA - dateB;
    });

    // Initialize matches display
    updateNextMatch();
    
    // Update matches every 5 minutes
    setInterval(updateNextMatch, 300000);
});

// Debug logs for match updates
function logMatchUpdate() {
    console.log("Uppdaterar nästa match");
    const nextMatch = findNextMatch();
    console.log("Nästa match:", nextMatch);
    const nextMatchElement = document.getElementById('nextMatch');
    console.log("Next match element:", nextMatchElement);
}

// Debug logs for all matches
function logAllMatchesUpdate() {
    console.log("Uppdaterar alla matcher");
    const allMatchesElement = document.getElementById('allMatches');
    console.log("All matches element:", allMatchesElement);
}

// Mobile responsiveness helper
function checkMobileView() {
    return window.innerWidth <= 768;
}

// Date helper functions
function isToday(date) {
    const today = new Date();
    return date.getDate() === today.getDate() &&
        date.getMonth() === today.getMonth() &&
        date.getFullYear() === today.getFullYear();
}

function isFutureDate(date) {
    const now = new Date();
    return date > now;
}

// Error handling wrapper
function handleError(error, context) {
    console.error(`Error in ${context}:`, error);
    showNotification(`Ett fel uppstod: ${context}`, 'error');
}

// Clean up function for page unload
window.addEventListener('beforeunload', () => {
    if (unsubscribeRanking) {
        unsubscribeRanking();
    }
});
