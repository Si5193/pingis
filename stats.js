class StatsManager {
    constructor() {
        this.winRateChart = null;
        this.progressChart = null;
        this.initialize();
    }

    async initialize() {
        if (!currentUserData) return;
        await this.initializeCharts();
        this.setupEventListeners();
        await this.initializeMonthlyStats();
    }

    async initializeMonthlyStats() {
        const now = new Date();
        const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
        
        try {
            const monthDoc = await db.collection('players')
                .doc(currentUserData.id)
                .collection('monthlyStats')
                .doc(monthKey)
                .get();

            if (!monthDoc.exists) {
                await monthDoc.ref.set({
                    month: monthKey,
                    wins: 0,
                    losses: 0,
                    points: currentUserData.points || 0
                });
            }
        } catch (error) {
            console.error('Error initializing monthly stats:', error);
        }
    }

    async initializeCharts() {
        try {
            const winRateCtx = document.getElementById('winRateChart').getContext('2d');
            const progressCtx = document.getElementById('progressChart').getContext('2d');

            const monthLabels = this.getLastFiveMonths();
            const winRateData = await this.calculateWinRateData();
            const pointsData = await this.calculatePointsData();

            // Vinstprocent över tid
            this.winRateChart = new Chart(winRateCtx, {
                type: 'line',
                data: {
                    labels: monthLabels,
                    datasets: [{
                        label: 'Vinstprocent',
                        data: winRateData,
                        borderColor: '#3498db',
                        tension: 0.4,
                        fill: true,
                        backgroundColor: 'rgba(52, 152, 219, 0.1)'
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        title: {
                            display: true,
                            text: 'Vinstprocent över tid'
                        }
                    },
                    scales: {
                        y: {
                            beginAtZero: true,
                            max: 100,
                            ticks: {
                                callback: function(value) {
                                    return value + '%';
                                }
                            }
                        }
                    }
                }
            });

            // Poängutveckling
            this.progressChart = new Chart(progressCtx, {
                type: 'bar',
                data: {
                    labels: monthLabels,
                    datasets: [{
                        label: 'Poäng per månad',
                        data: pointsData,
                        backgroundColor: '#2ecc71'
                    }]
                },
                options: {
                    responsive: true,
                    maintainAspectRatio: false,
                    plugins: {
                        title: {
                            display: true,
                            text: 'Poängutveckling'
                        }
                    },
                    scales: {
                        y: {
                            beginAtZero: true,
                            ticks: {
                                stepSize: 1
                            }
                        }
                    }
                }
            });
        } catch (error) {
            console.error('Error initializing charts:', error);
        }
    }

    getLastFiveMonths() {
        const months = ['Jan', 'Feb', 'Mar', 'Apr', 'Maj', 'Jun', 'Jul', 'Aug', 'Sep', 'Okt', 'Nov', 'Dec'];
        const now = new Date();
        const labels = [];
        
        for (let i = 4; i >= 0; i--) {
            const monthIndex = (now.getMonth() - i + 12) % 12;
            labels.push(months[monthIndex]);
        }
        
        return labels;
    }

    async calculateWinRateData() {
        try {
            const now = new Date();
            const fiveMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 4, 1);
            const fiveMonthsAgoKey = `${fiveMonthsAgo.getFullYear()}-${String(fiveMonthsAgo.getMonth() + 1).padStart(2, '0')}`;

            const stats = await db.collection('players')
                .doc(currentUserData.id)
                .collection('monthlyStats')
                .where('month', '>=', fiveMonthsAgoKey)
                .orderBy('month')
                .get();
            
            const data = new Array(5).fill(0); // Initialize with zeros
            
            stats.docs.forEach((doc, index) => {
                const monthData = doc.data();
                const totalGames = (monthData.wins || 0) + (monthData.losses || 0);
                data[index] = totalGames > 0 ? ((monthData.wins || 0) / totalGames * 100) : 0;
            });

            return data;
        } catch (error) {
            console.error('Error calculating win rate:', error);
            return [0, 0, 0, 0, 0];
        }
    }

    async calculatePointsData() {
        try {
            const now = new Date();
            const fiveMonthsAgo = new Date(now.getFullYear(), now.getMonth() - 4, 1);
            const fiveMonthsAgoKey = `${fiveMonthsAgo.getFullYear()}-${String(fiveMonthsAgo.getMonth() + 1).padStart(2, '0')}`;

            const stats = await db.collection('players')
                .doc(currentUserData.id)
                .collection('monthlyStats')
                .where('month', '>=', fiveMonthsAgoKey)
                .orderBy('month')
                .get();
            
            const data = new Array(5).fill(0); // Initialize with zeros
            
            stats.docs.forEach((doc, index) => {
                data[index] = doc.data().points || 0;
            });

            return data;
        } catch (error) {
            console.error('Error calculating points:', error);
            return [0, 0, 0, 0, 0];
        }
    }

    async updateStats(wins, losses, points) {
        const now = new Date();
        const monthKey = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`;
        
        try {
            await db.collection('players')
                .doc(currentUserData.id)
                .collection('monthlyStats')
                .doc(monthKey)
                .set({
                    month: monthKey,
                    wins: firebase.firestore.FieldValue.increment(wins),
                    losses: firebase.firestore.FieldValue.increment(losses),
                    points: firebase.firestore.FieldValue.increment(points)
                }, { merge: true });

            await this.updateCharts();
        } catch (error) {
            console.error('Error updating stats:', error);
            showNotification('Ett fel uppstod vid uppdatering av statistik', 'error');
        }
    }

    async updateCharts() {
        try {
            const monthLabels = this.getLastFiveMonths();
            const winRateData = await this.calculateWinRateData();
            const pointsData = await this.calculatePointsData();

            if (this.winRateChart && this.progressChart) {
                this.winRateChart.data.labels = monthLabels;
                this.winRateChart.data.datasets[0].data = winRateData;
                this.winRateChart.update();

                this.progressChart.data.labels = monthLabels;
                this.progressChart.data.datasets[0].data = pointsData;
                this.progressChart.update();
            }
        } catch (error) {
            console.error('Error updating charts:', error);
        }
    }

    setupEventListeners() {
        document.addEventListener('statsUpdated', () => this.updateCharts());
    }
}

// Initialize StatsManager when page loads
document.addEventListener('DOMContentLoaded', () => {
    // Wait for Firebase auth and user data
    setTimeout(() => {
        if (currentUser && currentUserData) {
            window.statsManager = new StatsManager();
        }
    }, 1000);
});

// Export for use in other files
window.StatsManager = StatsManager;
