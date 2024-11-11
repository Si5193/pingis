class TrainingManager {
    constructor() {
        this.initializeElements();
        this.trainingStartTime = null;
        this.timerInterval = null;
        this.isTraining = false;
        this.setupEventListeners();
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

    setupEventListeners() {
        this.checkInBtn.addEventListener('click', () => this.startTraining());
        this.checkOutBtn.addEventListener('click', () => this.endTraining());
        this.submitEvalBtn.addEventListener('click', () => this.submitEvaluation());
    }

    startTraining() {
        if (this.isTraining) return;

        this.isTraining = true;
        this.trainingStartTime = new Date();
        
        // Update UI
        this.statusDot.classList.add('active');
        this.statusText.textContent = 'Aktiv träning';
        this.checkInBtn.classList.add('hidden');
        this.checkOutBtn.classList.remove('hidden');
        
        // Start timer
        this.startTimer();
        
        // Save training start in Firebase
        this.saveTrainingStart();
    }

    endTraining() {
        if (!this.isTraining) return;

        this.isTraining = false;
        clearInterval(this.timerInterval);
        
        // Update UI
        this.statusDot.classList.remove('active');
        this.statusText.textContent = 'Ej aktiv';
        this.checkInBtn.classList.remove('hidden');
        this.checkOutBtn.classList.add('hidden');
        
        // Show evaluation form
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

    async saveTrainingStart() {
        try {
            const trainingRef = await db.collection('trainingSessions').add({
                userId: currentUser.uid,
                userName: currentUserData.name,
                startTime: firebase.firestore.FieldValue.serverTimestamp(),
                status: 'active'
            });
            
            this.currentTrainingId = trainingRef.id;
        } catch (error) {
            console.error('Error saving training start:', error);
            showNotification('Ett fel uppstod vid start av träning', 'error');
        }
    }

    async submitEvaluation() {
        if (!this.currentTrainingId) return;

        try {
            const endTime = firebase.firestore.FieldValue.serverTimestamp();
            const duration = new Date() - this.trainingStartTime;
            
            // Get selected techniques
            const goodTechniques = Array.from(document.querySelectorAll('input[name="goodTechniques"]:checked'))
                .map(cb => cb.value);
            const improveTechniques = Array.from(document.querySelectorAll('input[name="improveTechniques"]:checked'))
                .map(cb => cb.value);
            
            // Get notes
            const goodNotes = document.getElementById('goodNotes').value;
            const improveNotes = document.getElementById('improveNotes').value;

            // Update training session
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

            // Update user's total training time
            await db.collection('players').doc(currentUserData.id).update({
                totalTrainingTime: firebase.firestore.FieldValue.increment(duration),
                monthlyTrainingTime: firebase.firestore.FieldValue.increment(duration)
            });

            // Reset form and hide
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
                .get();

            this.trainingBody.innerHTML = '';
            
            snapshot.docs.forEach((doc, index) => {
                const data = doc.data();
                const totalHours = this.formatHours(data.totalTrainingTime || 0);
                const monthlyHours = this.formatHours(data.monthlyTrainingTime || 0);
                
                const row = document.createElement('tr');
                row.innerHTML = `
                    <td>${index + 1}</td>
                    <td>${data.name}</td>
                    <td>${totalHours}</td>
                    <td>${monthlyHours}</td>
                `;
                
                if (doc.id === currentUserData.id) {
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
            const snapshot = await db.collection('players').get();
            const batch = db.batch();
            
            snapshot.docs.forEach(doc => {
                batch.update(doc.ref, { monthlyTrainingTime: 0 });
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
