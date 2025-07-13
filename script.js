document.addEventListener('DOMContentLoaded', function() {
    // --- CONFIGURATION ---
    const AI_SERVICE_BASE_URL = "http://localhost:8040/api/v1/ai";

    // --- DOM ELEMENTS ---
    const getRecommendationsBtn = document.getElementById('getRecommendationsBtn');
    const recommendationsContainer = document.getElementById('recommendationsContainer');
    const learningPathModal = document.getElementById('learningPathModal');
    const modalTitle = document.getElementById('modalTitle');
    const modalBody = document.getElementById('modalBody');
    const closeModalBtn = document.getElementById('closeModalBtn');
    const experienceLevelSelect = document.getElementById('experienceLevel');
    const statusIndicator = document.getElementById('statusIndicator');
    const statusText = document.getElementById('statusText');
    const userIdInput = document.getElementById('userIdInput'); // New: Get User ID input element

    let userProfile = {
        skills: [],
        interests: [],
        completed_courses: [],
        experience_level: 'intermediate',
        preferred_domains: []
    };

    // --- UTILITY FUNCTIONS ---
    function setupTagInput(inputId, listId, profileKey) {
        const inputElement = document.getElementById(inputId);
        const listContainer = document.getElementById(listId);
        inputElement.addEventListener('keypress', function(e) {
            if (e.key === 'Enter') {
                e.preventDefault();
                const value = inputElement.value.trim();
                if (value && !userProfile[profileKey].includes(value)) {
                    userProfile[profileKey].push(value);
                    const tag = document.createElement('div');
                    tag.className = 'skill-tag';
                    tag.innerHTML = `${value} <span class="remove" data-key="${profileKey}" data-value="${value}">×</span>`;
                    listContainer.appendChild(tag);
                    inputElement.value = '';
                }
            }
        });
    }

    document.body.addEventListener('click', function(e) {
        if (e.target.classList.contains('remove')) {
            const key = e.target.dataset.key;
            const value = e.target.dataset.value;
            userProfile[key] = userProfile[key].filter(item => item !== value);
            e.target.parentElement.remove();
        }
    });

    // --- CORE API LOGIC ---
    async function getRecommendationsFromAI() {
        getRecommendationsBtn.classList.add('loading');
        recommendationsContainer.innerHTML = '<p class="placeholder-text">🤖 AI is analyzing your profile...</p>';
        userProfile.experience_level = experienceLevelSelect.value;

        try {
            const response = await fetch(`${AI_SERVICE_BASE_URL}/recommendations`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(userProfile)
            });
            if (!response.ok) throw new Error((await response.json()).detail || 'Failed to get recommendations.');
            
            const data = await response.json();
            displayRecommendations(data.recommendations);
        } catch (error) {
            recommendationsContainer.innerHTML = `<p class="placeholder-text error">${error.message}</p>`;
        } finally {
            getRecommendationsBtn.classList.remove('loading');
        }
    }

    function displayRecommendations(recommendations) {
        if (!recommendations || recommendations.length === 0) {
            recommendationsContainer.innerHTML = `<p class="placeholder-text">🔍 No matching recommendations found. Try adding more skills!</p>`;
            return;
        }
        window.jobRecommendations = recommendations;
        recommendationsContainer.innerHTML = recommendations.map((job, index) => `
            <div class="recommendation-card" onclick="showLearningPath(${index})">
                <div class="rec-header">
                    <div class="rec-title">${job.title}</div>
                    <div class="rec-score">${Math.round(job.score * 100)}%</div>
                </div>
                <div class="rec-domain">📁 ${job.domain}</div>
                <div class="rec-skills">${job.required_skills.map(skill => `<span class="rec-skill">${skill}</span>`).join('')}</div>
            </div>
        `).join('');
    }

    // --- LEARNING PATH LOGIC ---
    window.showLearningPath = async function(index) {
        const job = window.jobRecommendations[index];
        modalTitle.textContent = `Learning Path for ${job.title}`;
        learningPathModal.style.display = 'flex';
        setTimeout(() => learningPathModal.classList.add('active'), 10);
        modalBody.innerHTML = '<p class="placeholder-text">Checking for active path... 🔎</p>';

        const userId = userIdInput.value.trim(); // Get user ID from input
        if (!userId) { // Check if user ID is provided
            displayPathError(new Error('Please enter a User ID to manage learning paths.')); //
            return; //
        }

        try {
            const activePathResponse = await fetch(`${AI_SERVICE_BASE_URL}/users/${userId}/paths`); // Use userId
            if (activePathResponse.ok) {
                const activePath = await activePathResponse.json();
                if (activePath && activePath.job_id === job.job_id) {
                    displayStatefulPath(activePath);
                    return;
                } else if (activePath) {
                    modalBody.innerHTML = `<p class="placeholder-text">You are already on a learning path for "${activePath.job_title}".<br>Please complete it before starting a new one.</p>`;
                    return;
                }
            }
            displayPathProposal(job);
        } catch (error) {
            displayPathError(error);
        }
    };

    async function displayPathProposal(job) {
        try {
            const response = await fetch(`${AI_SERVICE_BASE_URL}/jobs/${job.job_id}/learning-path`);
            if (!response.ok) throw new Error('Could not fetch path template.');
            const data = await response.json();
            renderPathSteps(data.path, false);
            const startButton = document.createElement('button');
            startButton.className = 'btn';
            startButton.textContent = 'Start This Learning Path';
            startButton.onclick = () => startLearningPath(job.job_id);
            modalBody.appendChild(startButton);
        } catch(error) {
            displayPathError(error);
        }
    }

    function displayStatefulPath(pathData) {
        const progressHtml = `
            <div class="progress-bar-container">
                <div class="progress-bar" style="width: ${pathData.progress_percentage}%"></div>
                <span>${pathData.progress_percentage}% Complete</span>
            </div>`;
        modalBody.innerHTML = progressHtml;
        renderPathSteps(pathData.steps, true, pathData.id);
    }
    
    function renderPathSteps(steps, isStateful, pathId = null) {
        const stepsHtml = steps.map(step => {
            const stepNumber = isStateful ? step.step_number : step.step;
            const courses = isStateful ? step.courses : step.recommended_courses;
            const coursesHtml = courses.map(course => `
                <div class="course-card">
                    <div class="course-title">${course.title}</div>
                    <div class="course-provider">${course.provider} - ${course.difficulty || ''}</div>
                    <a href="${course.url}" target="_blank" class="course-link">Go to Course →</a>
                </div>
            `).join('');

            if (isStateful) {
                return `
                    <div class="path-step stateful">
                        <input type="checkbox" id="step-${stepNumber}" ${step.status === 'completed' ? 'checked' : ''} onchange="updateStepStatus('${pathId}', ${stepNumber}, this.checked)">
                        <label for="step-${stepNumber}" class="step-details">
                            <h3>${step.title}</h3>
                            <p>${step.description}</p>
                            <div class="courses-container">${coursesHtml}</div>
                        </label>
                    </div>`;
            } else {
                return `
                    <div class="path-step">
                        <div class="step-number">${stepNumber}</div>
                        <div class="step-details">
                            <h3>${step.title}</h3>
                            <p>${step.description}</p>
                            <div class="courses-container">${coursesHtml}</div>
                        </div>
                    </div>`;
            }
        }).join('');
        
        if (isStateful) {
            modalBody.innerHTML += stepsHtml;
        } else {
            modalBody.innerHTML = stepsHtml;
        }
    }

    async function startLearningPath(jobId) {
        modalBody.innerHTML = '<p class="placeholder-text">Saving path to your profile...</p>';
        const userId = userIdInput.value.trim(); // Get user ID from input
        if (!userId) { // Check if user ID is provided
            displayPathError(new Error('Please enter a User ID to start a learning path.')); //
            return; //
        }
        try {
            const response = await fetch(`${AI_SERVICE_BASE_URL}/users/${userId}/paths?job_id=${jobId}`, { method: 'POST' }); // Use userId
            if (!response.ok) throw new Error((await response.json()).detail || 'Failed to start path.');
            const newPath = await response.json();
            displayStatefulPath(newPath);
        } catch (error) {
            displayPathError(error);
        }
    }

    window.updateStepStatus = async function(pathId, stepNumber, isChecked) {
        const newStatus = isChecked ? 'completed' : 'pending';
        const userId = userIdInput.value.trim(); // Get user ID from input
        if (!userId) { // Check if user ID is provided
            alert('Please enter a User ID to update progress.'); //
            return; //
        }
        try {
            const response = await fetch(`${AI_SERVICE_BASE_URL}/paths/${pathId}/steps/${stepNumber}?status=${newStatus}`, { method: 'PATCH' });
            if (!response.ok) throw new Error('Failed to update step.');
            const updatedPath = await response.json();
            document.querySelector('.progress-bar').style.width = `${updatedPath.progress_percentage}%`;
            document.querySelector('.progress-bar-container span').textContent = `${updatedPath.progress_percentage}% Complete`;
        } catch (error) {
            alert('Could not update progress.');
        }
    };

    function displayPathError(error) {
        modalBody.innerHTML = `<p class="placeholder-text error">⚠️ ${error.message}</p>`;
    }

    function hideLearningPath() {
        learningPathModal.classList.remove('active');
        setTimeout(() => { learningPathModal.style.display = 'none'; }, 300);
    }

    // --- INITIALIZATION ---
    async function checkServiceHealth() {
        try {
            const response = await fetch(`${AI_SERVICE_BASE_URL}/health`);
            if (!response.ok) throw new Error();
            statusIndicator.className = 'status-indicator status-healthy';
            statusText.textContent = 'AI Service Online';
        } catch (error) {
            statusIndicator.className = 'status-indicator status-error';
            statusText.textContent = 'AI Service Offline';
        }
    }

    checkServiceHealth();
    setupTagInput('skillsInput', 'skillsList', 'skills');
    setupTagInput('interestsInput', 'interestsList', 'interests');
    setupTagInput('coursesInput', 'coursesList', 'completed_courses');
    setupTagInput('preferredDomains', 'domainsList', 'preferred_domains');

    document.getElementById('profileForm').addEventListener('submit', (e) => {
        e.preventDefault();
        getRecommendationsFromAI();
    });

    closeModalBtn.addEventListener('click', hideLearningPath);
    learningPathModal.addEventListener('click', (e) => {
        if (e.target === learningPathModal) hideLearningPath();
    });
});
