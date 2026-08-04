import './style.css'; 
import * as THREE from 'three';
import { STLLoader } from 'three/addons/loaders/STLLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

// SADECE SİPARİŞ SAYFASINDA ÇALIŞMASINI SAĞLAYAN GÜVENLİK KİLİDİ
const container = document.getElementById('canvas-container');

if (container) {
  const fileInput = document.getElementById('file-input');
  const uploadOverlay = document.getElementById('upload-overlay');

  const volumeVal = document.getElementById('volume-val');
  const dimVal = document.getElementById('dim-val');
  const materialSelect = document.getElementById('material-select');
  const infillInput = document.getElementById('infill-input');
  const infillVal = document.getElementById('infill-val');
  const totalPriceEl = document.getElementById('total-price');
  const orderBtn = document.getElementById('order-btn');
  const alertBox = document.getElementById('alert-box'); 

  const scene = new THREE.Scene();
  scene.background = new THREE.Color('#1a1a24');

  const camera = new THREE.PerspectiveCamera(45, container.clientWidth / container.clientHeight, 0.1, 1000);
  camera.position.set(100, 100, 100);

  const renderer = new THREE.WebGLRenderer({ antialias: true });
  renderer.setSize(container.clientWidth, container.clientHeight);
  container.appendChild(renderer.domElement);

  const controls = new OrbitControls(camera, renderer.domElement);
  controls.enableDamping = true;

  const ambientLight = new THREE.AmbientLight(0x404040, 1.5);
  scene.add(ambientLight);
  const directionalLight = new THREE.DirectionalLight(0xffffff, 2);
  directionalLight.position.set(1, 1, 1).normalize();
  scene.add(directionalLight);

  let currentMesh = null;
  let modelVolumeCm3 = 0;
  let modelSize = new THREE.Vector3(); 

  window.addEventListener('resize', () => {
    camera.aspect = container.clientWidth / container.clientHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(container.clientWidth, container.clientHeight);
  });

  function animate() {
    requestAnimationFrame(animate);
    controls.update();
    renderer.render(scene, camera);
  }
  animate();

  function calculateVolume(geometry) {
    let position = geometry.attributes.position;
    let faces = position.count / 3;
    let sum = 0;
    let p1 = new THREE.Vector3(), p2 = new THREE.Vector3(), p3 = new THREE.Vector3();

    for (let i = 0; i < faces; i++) {
      p1.fromBufferAttribute(position, i * 3 + 0);
      p2.fromBufferAttribute(position, i * 3 + 1);
      p3.fromBufferAttribute(position, i * 3 + 2);
      sum += p1.dot(p2.cross(p3)) / 6.0;
    }
    return Math.abs(sum) / 1000; 
  }

  function updatePriceAndValidation() {
    if (modelVolumeCm3 === 0) return;

    // Excel'den Alınan Gerçek Veriler (Yoğunluk, Fiyat, Stok)
    const materials = {
      "PLA-BEYAZ": { density: 1.24, pricePerGram: 0.8, stock: 1000 },
      "PLA-MAGENTA": { density: 1.24, pricePerGram: 0.8, stock: 1000 },
      "PLA-PANZER": { density: 1.24, pricePerGram: 0.8, stock: 1000 },
      "PLA-ATAK": { density: 1.24, pricePerGram: 0.8, stock: 1000 },
      "PETG-HT-SIYAH": { density: 1.27, pricePerGram: 1.0, stock: 2000 },
      "PETG-RCF08-SIYAH": { density: 1.28, pricePerGram: 2.2, stock: 500 },
      "PET-CF17-SIYAH": { density: 1.30, pricePerGram: 2.8, stock: 500 },
      "ASA-CF08-MAVI": { density: 1.12, pricePerGram: 2.2, stock: 500 },
      "PET-GF15-SIYAH": { density: 1.40, pricePerGram: 1.65, stock: 1000 },
      "PETG-ESD-SIYAH": { density: 1.28, pricePerGram: 5.0, stock: 500 },
      "PPS-GF20-GRI": { density: 1.50, pricePerGram: 8.0, stock: 500 }
    };

    const selectedMat = materials[materialSelect.value];
    const infill = parseInt(infillInput.value) / 100;
    
    // Temel Maliyet Hesabı
    const estimatedWeight = modelVolumeCm3 * selectedMat.density * infill;
    const baseFee = 50; 
    const rawCost = (estimatedWeight * selectedMat.pricePerGram) + baseFee;
    
    // YENİ: KÂR MARJI EKLENMESİ (%500 Kar = Maliyet * 6)
    // Örnek: 100 TL maliyet varsa, %500 karı (500 TL) eklenince satış fiyatı 600 TL olur.
    const finalSellingPrice = rawCost * 6;
    
    let errors = [];

    const dims = [modelSize.x, modelSize.y, modelSize.z].sort((a, b) => a - b);
    const bedDims = [320, 325, 330];
    if (!(dims[0] <= bedDims[0] && dims[1] <= bedDims[1] && dims[2] <= bedDims[2])) {
      errors.push("Model ölçüleri üretim tablamızı aşıyor.");
    }

    const boxVolume = modelSize.x * modelSize.y * modelSize.z;
    if ((modelVolumeCm3 * 1000) <= (boxVolume * 0.001)) {
      errors.push("Çiziminizde yüzey bozuklukları var (Non-Manifold).");
    }

    if (estimatedWeight > selectedMat.stock) {
      errors.push(`Yetersiz stok! Gereken: ~${estimatedWeight.toFixed(0)}gr, Stokta Kalan: ${selectedMat.stock}gr.`);
    }

    if (errors.length > 0) {
      alertBox.style.display = 'block';
      alertBox.style.backgroundColor = '#fee2e2';
      alertBox.style.color = '#991b1b';
      alertBox.style.border = '1px solid #ef4444';
      alertBox.innerHTML = "<strong>SİSTEM UYARISI:</strong><br>" + errors.join("<br>");
      
      orderBtn.disabled = true;
      totalPriceEl.innerText = 'Hesaplanamadı';
    } else {
      alertBox.style.display = 'block';
      alertBox.style.backgroundColor = '#dcfce7';
      alertBox.style.color = '#166534';
      alertBox.style.border = '1px solid #22c55e';
      alertBox.innerText = `✓ Geometri üretime uygun onaylandı.`;
      
      orderBtn.disabled = false;
      totalPriceEl.innerText = finalSellingPrice.toFixed(2) + ' TL'; // Kârlı satış fiyatı ekrana basılır
    }
  }

  materialSelect.addEventListener('change', updatePriceAndValidation);
  infillInput.addEventListener('input', (e) => {
    infillVal.innerText = e.target.value;
    updatePriceAndValidation();
  });

  fileInput.addEventListener('change', function(e) {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.addEventListener('load', function(event) {
      const contents = event.target.result;
      const loader = new STLLoader();
      const geometry = loader.parse(contents);
      
      geometry.computeVertexNormals();
      geometry.center(); 

      if (currentMesh) scene.remove(currentMesh);

      const material = new THREE.MeshStandardMaterial({ color: 0x4f46e5, roughness: 0.4, metalness: 0.1 });
      currentMesh = new THREE.Mesh(geometry, material);
      scene.add(currentMesh);

      modelVolumeCm3 = calculateVolume(geometry);
      volumeVal.innerText = modelVolumeCm3.toFixed(2);

      geometry.computeBoundingBox();
      geometry.boundingBox.getSize(modelSize); 
      dimVal.innerText = `${modelSize.x.toFixed(1)} x ${modelSize.y.toFixed(1)} x ${modelSize.z.toFixed(1)}`;

      const maxDim = Math.max(modelSize.x, modelSize.y, modelSize.z);
      camera.position.set(maxDim * 1.5, maxDim * 1.5, maxDim * 1.5);
      controls.target.set(0, 0, 0);
      
      uploadOverlay.style.display = 'none';

      updatePriceAndValidation();

    }, false);
    
    reader.readAsArrayBuffer(file);
  });
}