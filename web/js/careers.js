let currentStep = 1;
const totalSteps = 3;

const stepTitles = {
    1: { title: "About Yourself", desc: "This is where we know a bit about you before we move on." },
    2: { title: "Experience & Background", desc: "Tell us about your history and availability." },
    3: { title: "Final Stretch", desc: "The ending of the application." }
};

function changeStep(direction) {
    // Validate step 1 fields if trying to move forward
    if (currentStep === 1 && direction === 1) {
        const position = document.getElementById('position').value;
        const discord = document.getElementById('discord').value.trim();
        const vrchat = document.getElementById('vrchat').value.trim();
        if (!position || !discord || !vrchat) {
            alert("Please fill out all required fields in Section 1.");
            return;
        }
    }

    // Validate agreement checkbox on final step
    if (currentStep === 3 && direction === 1) {
        const agreed = document.getElementById('agreement-check').checked;
        if (!agreed) {
            alert("Please agree to the terms before submitting.");
            return;
        }
        submitApplication();
        return;
    }

    currentStep += direction;
    if (currentStep < 1) currentStep = 1;
    if (currentStep > totalSteps) currentStep = totalSteps;

    updateFormView();
}

function updateFormView() {
    document.querySelectorAll('.form-section').forEach(el => {
        el.classList.add('hidden');
        if (parseInt(el.getAttribute('data-step')) === currentStep) {
            el.classList.remove('hidden');
        }
    });

    document.getElementById('form-title').textContent = stepTitles[currentStep].title;
    document.getElementById('form-desc').textContent = stepTitles[currentStep].desc;
    document.getElementById('current-step-num').textContent = currentStep;

    const prevBtn = document.getElementById('prev-btn');
    if (currentStep === 1) prevBtn.classList.add('hidden');
    else prevBtn.classList.remove('hidden');

    const nextBtn = document.getElementById('next-btn');
    if (currentStep === totalSteps) {
        nextBtn.textContent = "Submit Application";
    } else {
        nextBtn.textContent = "Next Step";
    }
}

async function submitApplication() {
    const formData = {
        position: document.getElementById('position').value,
        discord: document.getElementById('discord').value,
        vrchat: document.getElementById('vrchat').value,
        why_apply: document.getElementById('why_apply').value,
        experience_length: document.getElementById('experience_length').value,
        availability: document.getElementById('availability').value,
        portfolio: document.getElementById('portfolio').value,
        reference: document.getElementById('reference').value
    };

    try {
        // Send data to your Google Apps Script Web App URL
        const response = await fetch('https://script.google.com/macros/s/AKfycby0X1lfDNDQUr6Dv26DcBtJ1ufCSUN4izVTYkVtx72_q-hKs5KnO1eAQJOu2Y5gRQIC/exec', {
            method: 'POST',
            body: JSON.stringify(formData)
        });
        
        const result = await response.json();
        if (!result.success) throw new Error(result.error || "Server responded with an error.");

        // UI Transition to success state
        document.getElementById('careers-form').classList.add('hidden');
        document.getElementById('form-header').classList.add('hidden');
        document.getElementById('success-state').classList.remove('hidden');
        lucide.createIcons();
    } catch (err) {
        alert("Failed to submit application: " + err.message);
    }
}

// Initial icon setup load
lucide.createIcons();