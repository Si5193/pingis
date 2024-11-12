class TrainingManager {
    constructor() {
        this.initializeElements();
        this.trainingStartTime = null;
        this.timerInterval = null;
        this.isTraining = false;
        this.setupEventListeners();
        this.checkActiveSession();
        this.loadTrainingStats();
    }

    initializeElements() {
        // Timer elements
        this.statusIndicator = document.getElementById('trainingStatus');
        this.timerDisplay = document.getElementById('trainingTimer');
        this.checkInBtn = document.getElementById('checkInBtn');
        this.checkOutBtn = document.getElementById('checkOutBtn');
        
        // Evaluation elements
        this.evaluationForm = document.getElementById('trainingEvaluation');
        this.submitEvalBtn = document.getElementById('submitEvaluation');
        
        // Statistics elements
        this.trainingBody = document.getElementById('trainingBody');
        
        // Status dot element
        this.statusDot = this.statusIndicator.querySelector('.status-dot');
        this.statusText = this.statusIndicator.querySelector('.status-text');
    }

    async checkActiveSession() {
        try {
            const activeSession = await db.collection('trainingSessions')
                .where('userId', '==', currentUser.uid)
                .where('status', '==', 'active')
                .orderBy('startTime', 'desc')
                .limit(1)
                .get();

            if (!activeSession.empty) {
                const session = activeSession.docs[0];
                this.currentTrainingId = session.id;
                this.trainingStartTime = session.data().startTime.toDate();
                this.isTraining = true;
                
                // Resume timer
                this.statusDot.classList.add('active');
                this.statusText.textContent = 'Aktiv träning';
                this.checkInBtn.classList.add('hidden');
                this.checkOutBtn.classList.remove('hidden');
                this.startTimer();
            }
        } catch (error) {
            console.error('Error checking active session:', error);
        }
    }

    setupEventListeners() {
        this.checkInBtn.addEventListener('click', () => this.startTraining());
        this.checkOutBtn.addEventListener('click', () => this.endTraining());
        this.submitEvalBtn.addEventListener('click', () => this.submitEvaluation());

        // Spara utvärdering när användaren trycker Enter i textfälten
        document.querySelectorAll('textarea').forEach(textarea => {
            textarea.addEventListener('keypress', (e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                    e.preventDefault();
                    this.submitEvaluation();
                }
            });
        });
    }

    async startTraining() {
        if (this.isTraining) return;

        try {
            const now = firebase.firestore.Timestamp.now();
            
            // Kolla om det finns en träning samma dag
            const todayStart = new Date();
            todayStart.setHours(0, 0, 0, 0);
            
            const existingSession = await db.collection('trainingSessions')
                .where('userId', '==', currentUser.uid)
                .where('startTime', '>=', todayStart)
                .orderBy('startTime', 'desc')
                .get();

            if (!existingSession.empty) {
                if (!confirm('Du har redan tränat idag. Vill du starta en ny träning?')) {
                    return;
                }
            }

            // Starta ny träning
            const trainingRef = await db.collection('trainingSessions').add({
                userId: currentUser.uid,
                userName: currentUserData.name,
                startTime: now,
                status: 'active',
                date: todayStart
            });
            
            this.currentTrainingId = trainingRef.id;
            this.trainingStartTime = now.toDate();
            this.isTraining = true;
            
            // Uppdatera UI
            this.statusDot.classList.add('active');
            this.statusText.textContent = 'Aktiv träning';
            this.checkInBtn.classList.add('hidden');
            this.checkOutBtn.classList.remove('hidden');
            
            this.startTimer();
            showNotification('Träning startad!', 'success');
        } catch (error) {
            console.error('Error starting training:', error);
            showNotification('Ett fel uppstod vid start av träning', 'error');
        }
    }

    endTraining() {
        if (!this.isTraining) return;

        this.isTraining = false;
        clearInterval(this.timerInterval);
        
        // Uppdatera UI
        this.statusDot.classList.remove('active');
        this.statusText.textContent = 'Ej aktiv';
        this.checkInBtn.classList.remove('hidden');
        this.checkOutBtn.classList.add('hidden');
        
        // Visa utvärderingsformulär
        this.evaluationForm.classList.remove('hidden');
    }

    startTimer() {
        this.timerInterval = setInterval(() => {
            const now = new Date();
            const diff = now - this.trainingStartTime;
            this.timerDisplay.textContent = this.formatTime(diff);
        }, 1000);
    }

    formatTime(ms) {
        const seconds = Math.floor((ms / 1000) % 60);
        const minutes = Math.floor((ms / (1000 * 60)) % 60);
        const hours = Math.floor(ms / (1000 * 60 * 60));
        
        return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
    }

    async submitEvaluation() {
        if (!this.currentTrainingId) return;

        try {
            const endTime = firebase.firestore.FieldValue.serverTimestamp();
            const duration = new Date() - this.trainingStartTime;
            
            // Hämta valda tekniker
            const goodTechniques = Array.from(document.querySelectorAll('input[name="goodTechniques"]:checked'))
                .map(cb => cb.value);
            const improveTechniques = Array.from(document.querySelectorAll('input[name="improveTechniques"]:checked'))
                .map(cb => cb.value);
            
            const goodNotes = document.getElementById('goodNotes').value.trim();
            const improveNotes = document.getElementById('improveNotes').value.trim();

            // Uppdatera träningspasset
            await db.collection('trainingSessions').doc(this.currentTrainingId).update({
                endTime: endTime,
                duration: duration,
                status: 'completed',
                evaluation: {
                    goodTechniques,
                    improveTechniques,
                    goodNotes,
                    improveNotes
                }
            });

            // Uppdatera tekniker i spelarens statistik
            const techniqueUpdates = {};
            goodTechniques.forEach(technique => {
                techniqueUpdates[`techniques.${technique}.good`] = firebase.firestore.FieldValue.increment(1);
            });
            improveTechniques.forEach(technique => {
                techniqueUpdates[`techniques.${technique}.improve`] = firebase.firestore.FieldValue.increment(1);
            });

            // Uppdatera spelarens totala träningstid
            await db.collection('players').doc(currentUserData.id).update({
                totalTrainingTime: firebase.firestore.FieldValue.increment(duration),
                monthlyTrainingTime: firebase.firestore.FieldValue.increment(duration),
                lastTrainingDate: firebase.firestore.FieldValue.serverTimestamp(),
                ...techniqueUpdates
            });

            // Återställ formulär och dölj
            this.evaluationForm.classList.add('hidden');
            this.resetEvaluationForm();
            this.loadTrainingStats();
            
            showNotification('Träning registrerad!', 'success');
        } catch (error) {
            console.error('Error submitting evaluation:', error);
            showNotification('Ett fel uppstod vid registrering av träning', 'error');
        }
    }

    resetEvaluationForm() {
        document.querySelectorAll('input[type="checkbox"]').forEach(cb => cb.checked = false);
        document.getElementById('goodNotes').value = '';
        document.getElementById('improveNotes').value = '';
        this.timerDisplay.textContent = '00:00:00';
    }

    async loadTrainingStats() {
        try {
            const snapshot = await db.collection('players')
                .orderBy('totalTrainingTime', 'desc')
                .orderBy('name', 'asc')
                .get();

            this.trainingBody.innerHTML = '';
            
            snapshot.docs.forEach((doc, index) => {
                const data = doc.data();
                const totalHours = this.formatHours(data.totalTrainingTime || 0);
                const monthlyHours = this.formatHours(data.monthlyTrainingTime || 0);
                
                const row = document.createElement('tr');
                const isCurrentUser = doc.id === currentUserData.id;
                
                row.innerHTML = `
                    <td>${index + 1}</td>
                    <td>${data.name}${isCurrentUser ? ' (Du)' : ''}</td>
                    <td>${totalHours}</td>
                    <td>${monthlyHours}</td>
                `;
                
                if (isCurrentUser) {
                    row.classList.add('highlight');
                }
                
                this.trainingBody.appendChild(row);
            });
        } catch (error) {
            console.error('Error loading training stats:', error);
        }
    }

    formatHours(ms) {
        const hours = Math.floor(ms / (1000 * 60 * 60));
        const minutes = Math.floor((ms % (1000 * 60 * 60)) / (1000 * 60));
        return `${hours}h ${minutes}m`;
    }
}

// Initialize TrainingManager when page loads
document.addEventListener('DOMContentLoaded', () => {
    setTimeout(() => {
        if (currentUser && currentUserData) {
            window.trainingManager = new TrainingManager();
        }
    }, 1000);
});

// Reset monthly training time at the start of each month
function setupMonthlyReset() {
    const now = new Date();
    const nextMonth = new Date(now.getFullYear(), now.getMonth() + 1, 1);
    const timeUntilNextMonth = nextMonth - now;

    setTimeout(async () => {
        try {
            const batch = db.batch();
            const snapshot = await db.collection('players')
                .orderBy('monthlyTrainingTime', 'desc')
                .orderBy('name', 'asc')
                .get();
            
            snapshot.docs.forEach(doc => {
                batch.update(doc.ref, { 
                    monthlyTrainingTime: 0,
                    lastMonthTrainingTime: doc.data().monthlyTrainingTime || 0
                });
            });
            
            await batch.commit();
            setupMonthlyReset(); // Setup next month's reset
        } catch (error) {
            console.error('Error resetting monthly time:', error);
        }
    }, timeUntilNextMonth);
}

// Start monthly reset schedule
setupMonthlyReset();
