import './style.css';
import * as THREE from 'three';

// --- State ---
let isRunning = false;
let scene, camera, renderer, particles, ring;
let animationId;
let currentSpeed = 0;
let targetSpeed = 0;
let graphCanvas, graphCtx;
let graphData = [];
let maxGraphPoints = 100;
let currentPhase = 'idle'; // idle, ping, download, upload

// --- DOM Elements ---
const startButton = document.getElementById('start-btn');
const statusText = document.querySelector('.status-text');
const pingEl = document.getElementById('ping-value');
const downloadEl = document.getElementById('download-value');
const uploadEl = document.getElementById('upload-value');
const canvasContainer = document.getElementById('canvas-container');
const mainSpeedValue = document.getElementById('main-speed-value');

// --- Initialization ---
function init() {
  initThreeJS();
  initGraph();
  startButton.addEventListener('click', startTest);
  window.addEventListener('resize', onWindowResize);
  animate();
}

function initGraph() {
  graphCanvas = document.getElementById('speed-graph');
  graphCtx = graphCanvas.getContext('2d');
  resizeGraph();
}

function resizeGraph() {
  if (!graphCanvas) return;
  const parent = graphCanvas.parentElement;
  graphCanvas.width = parent.clientWidth;
  graphCanvas.height = parent.clientHeight;
}

function drawGraph() {
  if (!graphCtx || !graphCanvas) return;

  const width = graphCanvas.width;
  const height = graphCanvas.height;

  graphCtx.clearRect(0, 0, width, height);

  if (graphData.length < 2) return;

  // Dynamic scaling: find max value in current data
  const dataMax = Math.max(...graphData.map(d => d.value), 0);
  // Use the larger of phase max or data max (plus headroom)
  const scaleMax = Math.max(getMaxValue(), dataMax * 1.1);

  graphCtx.beginPath();
  graphCtx.moveTo(0, height - (graphData[0].value / scaleMax * height));

  // Draw line
  for (let i = 1; i < graphData.length; i++) {
    const x = (i / (maxGraphPoints - 1)) * width;
    const y = height - (graphData[i].value / scaleMax * height);
    // Clamp y to be within canvas (at least 0)
    const clampedY = Math.max(0, Math.min(height, y));
    graphCtx.lineTo(x, clampedY);
  }

  // Stroke style based on phase
  let strokeColor = '#94a3b8'; // default
  if (currentPhase === 'ping') strokeColor = '#0ea5e9'; // Blue
  if (currentPhase === 'download') strokeColor = '#10b981'; // Green
  if (currentPhase === 'upload') strokeColor = '#8b5cf6'; // Purple

  graphCtx.strokeStyle = strokeColor;
  graphCtx.lineWidth = 2;
  graphCtx.stroke();

  // Fill area
  graphCtx.lineTo(width, height);
  graphCtx.lineTo(0, height);
  graphCtx.fillStyle = strokeColor + '20'; // Low opacity
  graphCtx.fill();

  // Draw current value text
  const lastPoint = graphData[graphData.length - 1];
  const lastX = width; // Right edge
  const lastY = height - (lastPoint.value / scaleMax * height);
  const clampedLastY = Math.max(15, Math.min(height - 5, lastY)); // Keep text inside vertically

  graphCtx.fillStyle = '#fff';
  graphCtx.font = 'bold 12px Inter, sans-serif';
  graphCtx.textAlign = 'right';
  graphCtx.textBaseline = 'bottom';

  // Add a small background for readability if needed, or just shadow
  graphCtx.shadowColor = 'rgba(0,0,0,0.8)';
  graphCtx.shadowBlur = 4;

  graphCtx.fillText(`${Math.floor(lastPoint.value)} Mbps`, lastX - 5, clampedLastY - 5);

  // Reset shadow
  graphCtx.shadowColor = 'transparent';
}

function getMaxValue() {
  if (currentPhase === 'ping') return 100;
  if (currentPhase === 'download') return 500;
  if (currentPhase === 'upload') return 200;
  return 100;
}

function updateGraph(value) {
  graphData.push({ value, phase: currentPhase });
  if (graphData.length > maxGraphPoints) {
    graphData.shift();
  }
  drawGraph();
}

function initThreeJS() {
  // Scene setup
  scene = new THREE.Scene();
  // Add some fog for depth
  scene.fog = new THREE.FogExp2(0x0f172a, 0.002);

  // Camera
  camera = new THREE.PerspectiveCamera(75, canvasContainer.clientWidth / canvasContainer.clientHeight, 0.1, 1000);
  camera.position.z = 30;
  updateCameraPosition(); // Set initial position based on screen size

  // Renderer
  renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
  renderer.setSize(canvasContainer.clientWidth, canvasContainer.clientHeight);
  renderer.setPixelRatio(window.devicePixelRatio);
  canvasContainer.appendChild(renderer.domElement);

  // Objects
  createParticles();
  createRing();
}

function createParticles() {
  const geometry = new THREE.BufferGeometry();
  const vertices = [];
  const colors = [];

  for (let i = 0; i < 2000; i++) {
    const x = (Math.random() - 0.5) * 100;
    const y = (Math.random() - 0.5) * 100;
    const z = (Math.random() - 0.5) * 100;
    vertices.push(x, y, z);

    // Blue/Cyan colors
    colors.push(0.05, 0.65, 0.91);
  }

  geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));

  const material = new THREE.PointsMaterial({
    size: 0.2,
    vertexColors: true,
    transparent: true,
    opacity: 0.8,
  });

  particles = new THREE.Points(geometry, material);
  scene.add(particles);
}

function createRing() {
  const geometry = new THREE.TorusGeometry(10, 0.2, 16, 100);
  const material = new THREE.MeshBasicMaterial({ color: 0x0ea5e9, wireframe: true });
  ring = new THREE.Mesh(geometry, material);
  scene.add(ring);
}

function onWindowResize() {
  if (!camera || !renderer) return;
  camera.aspect = canvasContainer.clientWidth / canvasContainer.clientHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(canvasContainer.clientWidth, canvasContainer.clientHeight);
  resizeGraph();
  updateCameraPosition();
}

function updateCameraPosition() {
  if (window.innerWidth >= 1024) {
    // Desktop: Move camera right so objects appear on left
    // Object at 0, Camera at x.
    // To center object in left half (x=-width/4 approx in screen space), move camera to +x.
    camera.position.x = 15;
    camera.position.y = 0; // Reset Y for vertical centering
  } else {
    // Mobile: Center
    camera.position.x = 0;
    camera.position.y = -3; // Keep the vertical offset for mobile
  }
}

// --- Animation Loop ---
function animate() {
  animationId = requestAnimationFrame(animate);

  // Rotate particles based on speed
  if (particles) {
    particles.rotation.z += 0.002 + (currentSpeed * 0.0005);
    particles.rotation.x += 0.001;
  }

  // Rotate and scale ring based on speed
  if (ring) {
    ring.rotation.x += 0.01;
    ring.rotation.y += 0.01 + (currentSpeed * 0.001);

    // Pulse effect
    const scale = 1 + (currentSpeed * 0.001) + (Math.sin(Date.now() * 0.005) * 0.05);
    ring.scale.set(scale, scale, scale);

    // Color shift based on speed
    const hue = (200 + (currentSpeed / 2)) % 360;
    ring.material.color.setHSL(hue / 360, 1, 0.5);
  }

  // Update Main Speed Display
  if (mainSpeedValue) {
    mainSpeedValue.textContent = Math.floor(currentSpeed);
  }

  renderer.render(scene, camera);
}

// --- Logic ---
async function startTest() {
  if (isRunning) return;
  isRunning = true;
  startButton.disabled = true;
  resetResults();
  graphData = []; // Reset graph

  try {
    // 1. Ping
    currentPhase = 'ping';
    updateStatus('Testing Ping...');
    const ping = await simulatePing();
    pingEl.textContent = ping;
    pingEl.parentElement.style.borderColor = 'var(--accent-color)';

    // 2. Download
    currentPhase = 'download';
    updateStatus('Testing Download...');
    const downloadSpeed = await simulateSpeedTest('download');
    downloadEl.textContent = downloadSpeed;
    downloadEl.parentElement.style.borderColor = 'var(--success-color)';

    // 3. Upload
    currentPhase = 'upload';
    updateStatus('Testing Upload...');
    const uploadSpeed = await simulateSpeedTest('upload');
    uploadEl.textContent = uploadSpeed;
    uploadEl.parentElement.style.borderColor = 'var(--accent-color)';

    updateStatus('Test Complete');
    currentPhase = 'idle';
    currentSpeed = 0; // Reset visual speed
  } catch (error) {
    console.error(error);
    updateStatus('Error Occurred');
  } finally {
    isRunning = false;
    startButton.disabled = false;
    startButton.textContent = 'AGAIN';
  }
}

function resetResults() {
  pingEl.textContent = '--';
  downloadEl.textContent = '--';
  uploadEl.textContent = '--';
  currentSpeed = 0;

  document.querySelectorAll('.result-card').forEach(card => {
    card.style.borderColor = 'rgba(255, 255, 255, 0.05)';
  });
}

function updateStatus(text) {
  statusText.textContent = text;
}

function simulatePing() {
  return new Promise(resolve => {
    let progress = 0;
    const interval = setInterval(() => {
      progress += 10;
      // Visual feedback via speed variable
      currentSpeed = Math.random() * 20;
      updateGraph(currentSpeed); // Update graph

      if (progress >= 100) {
        clearInterval(interval);
        currentSpeed = 0;
        resolve(Math.floor(Math.random() * 15) + 5);
      }
    }, 50);
  });
}

function simulateSpeedTest(type) {
  return new Promise(resolve => {
    let progress = 0;
    // Higher speed simulation: 350-450 Mbps for download, 100-200 for upload
    targetSpeed = type === 'download'
      ? Math.floor(Math.random() * 100) + 350
      : Math.floor(Math.random() * 100) + 100;

    const interval = setInterval(() => {
      progress += 1;

      if (progress < 20) {
        currentSpeed += targetSpeed * 0.02;
      } else if (progress > 80) {
        currentSpeed -= targetSpeed * 0.01;
      } else {
        currentSpeed = targetSpeed + (Math.random() * 10 - 5);
      }

      updateGraph(currentSpeed); // Update graph

      if (progress >= 100) {
        clearInterval(interval);
        resolve(targetSpeed.toFixed(1));
      }
    }, 50);
  });
}

// Hide loader when loaded
window.addEventListener('load', () => {
  const loader = document.getElementById('loader');
  if (loader) {
    // Ensure a minimum display time for smoothness
    setTimeout(() => {
      loader.classList.add('hidden');
    }, 500);
  }
});

// Start the app
init();
