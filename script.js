import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

// --- Global Variables ---
let scene, camera, renderer, composer, controls;
let sphereMesh, originalPositions, starSystem;
let audioContext, analyser, dataArray;
let currentSource = null;
let isAudioRunning = false;
let colorHue = 0;

// Dashboard Visibility Timer
let dashboardTimeout;
const dashboardElement = document.getElementById('dashboard');

// UI Elements
const startBtn = document.getElementById('btn-start');
const stopBtn = document.getElementById('btn-stop');
const fsBtn = document.getElementById('btn-fullscreen');
const statusText = document.getElementById('status-text');
const dropOverlay = document.getElementById('drop-overlay');

// Control Elements
const sensitivityInput = document.getElementById('sensitivity');
const autoColorCheckbox = document.getElementById('auto-color');
const meshColorPicker = document.getElementById('mesh-color');

// --- Initialization ---
function init() {
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x050505);
    scene.fog = new THREE.FogExp2(0x050505, 0.002);

    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.z = 4;

    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    document.getElementById('canvas-container').appendChild(renderer.domElement);

    // --- FEATURE: Orbit Controls (Mouse Interaction) ---
    controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true; // Smooth animation
    controls.dampingFactor = 0.05;
    controls.enableZoom = true;

    createMainSphere();
    createStarField();

    // Bloom Effect
    const renderScene = new RenderPass(scene, camera);
    const bloomPass = new UnrealBloomPass(new THREE.Vector2(window.innerWidth, window.innerHeight), 1.5, 0.4, 0.85);
    bloomPass.strength = 2.2;
    bloomPass.radius = 0.5;
    bloomPass.threshold = 0;

    composer = new EffectComposer(renderer);
    composer.addPass(renderScene);
    composer.addPass(bloomPass);

    window.addEventListener('resize', onWindowResize);
    
    // Init Drag and Drop Listeners
    setupDragDrop();

    // Init Dashboard Hiding Logic
    setupDashboardHiding();

    animate();
}

function createMainSphere() {
    const geometry = new THREE.IcosahedronGeometry(2, 20);
    const material = new THREE.MeshBasicMaterial({ 
        color: 0x00ffcc, 
        wireframe: true,
        transparent: true,
        opacity: 0.9
    });

    sphereMesh = new THREE.Mesh(geometry, material);
    scene.add(sphereMesh);

    const positionAttribute = geometry.attributes.position;
    originalPositions = [];
    for (let i = 0; i < positionAttribute.count; i++) {
        originalPositions.push(
            positionAttribute.getX(i),
            positionAttribute.getY(i),
            positionAttribute.getZ(i)
        );
    }
}

function createStarField() {
    const starGeometry = new THREE.BufferGeometry();
    const starCount = 2000;
    const posArray = new Float32Array(starCount * 3);

    for(let i = 0; i < starCount * 3; i++) {
        posArray[i] = (Math.random() - 0.5) * 60;
    }

    starGeometry.setAttribute('position', new THREE.BufferAttribute(posArray, 3));

    const starMaterial = new THREE.PointsMaterial({
        size: 0.05,
        color: 0xffffff,
        transparent: true,
        opacity: 0.8
    });

    starSystem = new THREE.Points(starGeometry, starMaterial);
    scene.add(starSystem);
}

function getAudioContext() {
    if (!audioContext) {
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
        analyser = audioContext.createAnalyser();
        analyser.fftSize = 512;
        const bufferLength = analyser.frequencyBinCount;
        dataArray = new Uint8Array(bufferLength);
    }
    if (audioContext.state === 'suspended') {
        audioContext.resume();
    }
    return audioContext;
}

// --- Audio Input Methods ---
async function startMicrophone() {
    stopAudio();
    try {
        const ctx = getAudioContext();
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        
        currentSource = ctx.createMediaStreamSource(stream);
        currentSource.connect(analyser);
        
        isAudioRunning = true;
        statusText.innerText = "Listening to Mic...";
        statusText.style.color = "#00ffcc";
    } catch (err) {
        console.error(err);
        statusText.innerText = "Mic Error / Denied";
        statusText.style.color = "red";
    }
}

function setupDragDrop() {
    ['dragenter', 'dragover', 'dragleave', 'drop'].forEach(eventName => {
        window.addEventListener(eventName, preventDefaults, false);
    });

    window.addEventListener('dragenter', () => dropOverlay.classList.remove('hidden'), false);
    window.addEventListener('dragover', () => dropOverlay.classList.remove('hidden'), false);
    window.addEventListener('dragleave', (e) => {
        if (e.clientX === 0 && e.clientY === 0) {
            dropOverlay.classList.add('hidden');
        }
    }, false);
    window.addEventListener('drop', handleDrop, false);
}

function preventDefaults(e) {
    e.preventDefault();
    e.stopPropagation();
}

async function handleDrop(e) {
    dropOverlay.classList.add('hidden');
    const dt = e.dataTransfer;
    const file = dt.files[0];

    if (file && file.type.startsWith('audio/')) {
        playAudioFile(file);
    } else {
        statusText.innerText = "Not an audio file!";
        statusText.style.color = "red";
    }
}

function playAudioFile(file) {
    stopAudio();
    statusText.innerText = "Loading File...";
    statusText.style.color = "yellow";

    const reader = new FileReader();
    reader.onload = function(e) {
        const arrayBuffer = e.target.result;
        const ctx = getAudioContext();
        ctx.decodeAudioData(arrayBuffer, (decodedBuffer) => {
            startFilePlayback(decodedBuffer);
        }, (error) => {
            console.error(error);
            statusText.innerText = "Error Decoding File";
            statusText.style.color = "red";
        });
    };
    reader.readAsArrayBuffer(file);
}

function startFilePlayback(buffer) {
    const ctx = getAudioContext();
    const source = ctx.createBufferSource();
    source.buffer = buffer;
    source.loop = true;

    source.connect(analyser);
    source.connect(ctx.destination);

    source.start(0);
    currentSource = source;
    isAudioRunning = true;
    statusText.innerText = "Playing File";
    statusText.style.color = "#00ffcc";
}

function stopAudio() {
    if (currentSource) {
        currentSource.disconnect();
        if (currentSource.stop) {
            try { currentSource.stop(); } catch(e) {} 
        }
        if (currentSource.mediaStream) {
            currentSource.mediaStream.getTracks().forEach(track => track.stop());
        }
        currentSource = null;
    }
    isAudioRunning = false;
    statusText.innerText = "Stopped";
    statusText.style.color = "#aaa";

    if(sphereMesh) {
        const positionAttribute = sphereMesh.geometry.attributes.position;
        for (let i = 0; i < positionAttribute.count; i++) {
            positionAttribute.setX(i, originalPositions[i * 3]);
            positionAttribute.setY(i, originalPositions[i * 3 + 1]);
            positionAttribute.setZ(i, originalPositions[i * 3 + 2]);
        }
        positionAttribute.needsUpdate = true;
    }
}

// --- Dashboard Auto-Hide Logic ---
function setupDashboardHiding() {
    // Listen for mouse movement on the whole document
    document.addEventListener('mousemove', resetDashboardTimer);
    document.addEventListener('click', resetDashboardTimer);
}

function resetDashboardTimer() {
    // Only hide if in fullscreen mode
    if (document.fullscreenElement) {
        dashboardElement.classList.remove('dashboard-hidden');
        clearTimeout(dashboardTimeout);
        
        // Hide after 5 seconds of inactivity
        dashboardTimeout = setTimeout(() => {
            if (document.fullscreenElement) {
                dashboardElement.classList.add('dashboard-hidden');
            }
        }, 5000);
    } else {
        // Always show if not in fullscreen
        dashboardElement.classList.remove('dashboard-hidden');
    }
}

// --- Animation Loop ---
function animate() {
    requestAnimationFrame(animate);

    // Update Controls (Mouse Interaction)
    controls.update();

    if (sphereMesh) {
        if (autoColorCheckbox.checked) {
            colorHue += 0.002; 
            sphereMesh.material.color.setHSL(colorHue % 1, 1, 0.5);
        } else {
            sphereMesh.material.color.set(meshColorPicker.value);
        }
    }

    if (isAudioRunning && analyser) {
        analyser.getByteFrequencyData(dataArray);

        let averageFreq = 0;
        for (let i = 0; i < dataArray.length; i++) {
            averageFreq += dataArray[i];
        }
        averageFreq = averageFreq / dataArray.length;

        const sensitivity = parseFloat(sensitivityInput.value);
        const positionAttribute = sphereMesh.geometry.attributes.position;
        const bassFreq = dataArray[10]; 
        const distortionStrength = Math.max(0, (bassFreq / 255) * sensitivity); 

        // --- FEATURE: Camera Shake on Bass Drop ---
        // If bass is extremely loud (>230 out of 255)
        if (bassFreq > 230) {
            // Apply a slight random offset to the camera
            // Note: OrbitControls will correct this next frame, causing a "jitter" effect
            const shakeIntensity = 0.05 * (sensitivity * 0.5);
            camera.position.x += (Math.random() - 0.5) * shakeIntensity;
            camera.position.y += (Math.random() - 0.5) * shakeIntensity;
            camera.position.z += (Math.random() - 0.5) * shakeIntensity;
        }

        for (let i = 0; i < positionAttribute.count; i++) {
            const px = originalPositions[i * 3];
            const py = originalPositions[i * 3 + 1];
            const pz = originalPositions[i * 3 + 2];

            const noise = 1 + Math.sin(px * 5 + Date.now() * 0.002) * Math.cos(py * 5) * (distortionStrength * 0.5);

            positionAttribute.setX(i, px * noise);
            positionAttribute.setY(i, py * noise);
            positionAttribute.setZ(i, pz * noise);
        }
        positionAttribute.needsUpdate = true;

        if(starSystem) {
            starSystem.rotation.y += 0.001 + (averageFreq * 0.0001);
            starSystem.rotation.x += 0.0005;
        }
        
        // Manual rotation is optional now that we have mouse controls,
        // but we keep a slow spin for aesthetics.
        sphereMesh.rotation.y += 0.002;

    } else {
        if(sphereMesh) sphereMesh.rotation.y += 0.002;
        if(starSystem) starSystem.rotation.y += 0.0005;
    }

    composer.render();
}

function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
    composer.setSize(window.innerWidth, window.innerHeight);
}

// --- Event Listeners ---
startBtn.addEventListener('click', startMicrophone);
stopBtn.addEventListener('click', stopAudio);

fsBtn.addEventListener('click', () => {
    if (!document.fullscreenElement) {
        document.body.requestFullscreen();
        resetDashboardTimer(); // Init timer logic on enter
    } else {
        document.exitFullscreen();
        dashboardElement.classList.remove('dashboard-hidden'); // Show immediately on exit
    }
});

// Also listen for Esc key or other exit methods
document.addEventListener('fullscreenchange', () => {
    if (!document.fullscreenElement) {
        dashboardElement.classList.remove('dashboard-hidden');
    } else {
        resetDashboardTimer();
    }
});

init();