import './style.css';
import * as THREE from 'three';
import { STLLoader } from 'three/addons/loaders/STLLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

// ==========================================
// BURAYA FORMSPREE LİNKİNİ YAPIŞTIR
// ==========================================
const FORMSPREE_URL = "https://formspree.io/f/xaewyqwr";

const sheetUrl = "https://docs.google.com/spreadsheets/d/e/2PACX-1vQKbN19b9JUaRXE4gmlnjNMVU2QjefMT-GALkVFka8DlvumqmqMPbyKkFqQSmHTwSz2Gplk0wC99A0n/pub?output=tsv";

let filamentData = [];
let selectedMaterialText = "";
let activeColor = "";

// ESKİ SATIRLAR İÇİN GÜVENLİK AĞI (Eğer Excel'de sadece isim yazıyorsa)
function getLegacyHex(colorName) {
  const name = colorName.toUpperCase().replace("İ", "I").replace("Ş", "S").replace("Ğ", "G").replace("Ü", "U").replace("Ö", "O").replace("Ç", "C").trim();
  const map = {
    "SIYAH": "#111111", "BEYAZ": "#f8fafc", "KIRMIZI": "#ef4444", "MAVI": "#3b82f6",
    "YESIL": "#22c55e", "SARI": "#eab308", "GRI": "#94a3b8", "ATAK GRISI": "#64748b",
    "PANZER YESILI": "#4d7c0f", "MAGENTA": "#db2777", "SEFFAF": "#f1f5f9",
    "GUMUS": "#cbd5e1", "TURUNCU": "#f97316", "LACIVERT": "#1e3a8a"
  };
  return map[name] || "#4f46e5";
}

async function loadFilamentData() {
  try {
    const response = await fetch(sheetUrl, { cache: "no-store" });
    const data = await response.text();

    const rows = data.split('\n');
    filamentData = [];

    for (let i = 1; i < rows.length; i++) {
      if (!rows[i].trim()) continue;
      const columns = rows[i].split('\t');

      const rawColor = columns[1] ? columns[1].trim() : '';
      let colorName = rawColor;
      let colorCode = rawColor;

      // EXCEL'DEN AKILLI RENK AYRIŞTIRICI (İsim | Kod)
      if (rawColor.includes('|')) {
        const parts = rawColor.split('|');
        colorName = parts[0].trim();
        colorCode = parts[1].trim();
      } else if (!rawColor.includes(',') && !rawColor.startsWith('#')) {
        // Eğer | yoksa ve sadece isim yazılmışsa eski sistemden kodu bul
        colorCode = getLegacyHex(rawColor);
      }

      filamentData.push({
        material: columns[0] ? columns[0].trim() : '',
        color: rawColor,       // Backend eşleşmesi için ham veri
        colorName: colorName,  // Ekranda müşterinin göreceği isim
        colorCode: colorCode,  // 3D boyama için RGB veya HEX kodu
        stock: parseFloat(columns[2] ? columns[2].trim().replace(',', '.') : 0),
        price: parseFloat(columns[3] ? columns[3].trim().replace(',', '.') : 0),
        brand: columns[4] ? columns[4].trim() : ''
      });
    }
    populateDropdown();
  } catch (error) {
    console.error("Tablo verisi çekilirken hata oluştu:", error);
  }
}

function populateDropdown() {
  const selectElement = document.getElementById("material-select");
  if (!selectElement) return;

  selectElement.innerHTML = '<option value="">Lütfen Malzeme Seçin</option>';

  const uniqueMaterials = [...new Set(filamentData.map(item => `${item.brand} ${item.material}`))];

  uniqueMaterials.forEach(mat => {
    const hasStock = filamentData.some(item => `${item.brand} ${item.material}` === mat && item.stock > 0);
    if (hasStock) {
      const option = document.createElement("option");
      option.value = mat;
      option.innerText = mat;
      selectElement.appendChild(option);
    }
  });
}

document.addEventListener("DOMContentLoaded", () => {
  loadFilamentData();
});

// 3D HESAPLAMA MODÜLÜ
const container = document.getElementById('canvas-container');

if (container) {
  const fileInput = document.getElementById('file-input');
  const uploadOverlay = document.getElementById('upload-overlay');
  const volumeVal = document.getElementById('volume-val');
  const dimVal = document.getElementById('dim-val');

  const materialSelect = document.getElementById('material-select');
  const colorSwatchesContainer = document.getElementById('color-swatches-container');
  const selectedColorText = document.getElementById('selected-color-text');

  const infillInput = document.getElementById('infill-input');
  const infillVal = document.getElementById('infill-val');
  const quantityInput = document.getElementById('quantity-input');

  const totalPriceEl = document.getElementById('total-price');
  const orderBtn = document.getElementById('order-btn');
  const alertBox = document.getElementById('alert-box');
  const resetBtn = document.getElementById('reset-view-btn');

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

    if (materialSelect.value === "" || activeColor === "") {
      totalPriceEl.innerText = '0.00 TL';
      orderBtn.disabled = true;
      return;
    }

    const selectedMatName = materialSelect.value;

    const selectedMat = filamentData.find(item =>
      `${item.brand} ${item.material}` === selectedMatName && item.color === activeColor
    );

    if (!selectedMat) return;

    // Mail'e gidecek veri formatı (İsmiyle beraber çok daha anlaşılır)
    selectedMaterialText = `${selectedMat.brand} ${selectedMat.material} - ${selectedMat.colorName}`;

    let matDensity = 1.25;
    const matName = selectedMat.material.toUpperCase();
    if (matName.includes("PLA")) matDensity = 1.24;
    else if (matName.includes("ASA")) matDensity = 1.12;
    else if (matName.includes("PETG-ESD")) matDensity = 1.28;
    else if (matName.includes("PETG")) matDensity = 1.27;
    else if (matName.includes("PET-CF")) matDensity = 1.30;
    else if (matName.includes("PET-GF")) matDensity = 1.40;
    else if (matName.includes("PPS")) matDensity = 1.50;
    else if (matName.includes("TPU")) matDensity = 1.21;
    else if (matName.includes("ABS")) matDensity = 1.04;

    const infill = parseInt(infillInput.value) / 100;
    const quantity = parseInt(quantityInput.value) || 1;

    const estimatedWeight = modelVolumeCm3 * matDensity * infill;
    const totalEstimatedWeight = estimatedWeight * quantity;
    const baseFee = 50;
    const finalSellingPrice = ((estimatedWeight * selectedMat.price) + baseFee) * 6 * quantity;

    let errors = [];
    const dims = [modelSize.x, modelSize.y, modelSize.z].sort((a, b) => a - b);
    if (!(dims[0] <= 320 && dims[1] <= 325 && dims[2] <= 330)) errors.push("Model ölçüleri tablamızı aşıyor.");
    if ((modelVolumeCm3 * 1000) <= (modelSize.x * modelSize.y * modelSize.z * 0.001)) errors.push("Çiziminizde yüzey bozuklukları var (Non-Manifold).");
    if (totalEstimatedWeight > selectedMat.stock) errors.push(`Yetersiz stok! ${quantity} adet için gereken: ~${totalEstimatedWeight.toFixed(0)}gr.`);

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
      totalPriceEl.innerText = finalSellingPrice.toFixed(2) + ' TL';
    }
  }

  // GÖRSEL RENK SEÇİMİ OLUŞTURUCU VE 3D RENKLENDİRME
  materialSelect.addEventListener('change', (e) => {
    const selectedMatName = e.target.value;
    colorSwatchesContainer.innerHTML = '';
    activeColor = "";

    if (!selectedMatName) {
      selectedColorText.innerText = "Önce Malzeme Seçin";
      updatePriceAndValidation();
      return;
    }

    selectedColorText.innerText = "Lütfen Renk Seçin";

    const availableColors = filamentData.filter(item =>
      `${item.brand} ${item.material}` === selectedMatName && item.stock > 0
    );

    availableColors.forEach(item => {
      // CSS uyumlu formata dönüştür (Eğer X,Y,Z yazılmışsa rgb(X,Y,Z) yapar)
      const cssColor = item.colorCode.includes(',') ? `rgb(${item.colorCode})` : item.colorCode;

      const swatch = document.createElement("div");
      swatch.className = "color-swatch";
      swatch.title = item.colorName;
      swatch.style.backgroundColor = cssColor;

      swatch.addEventListener('click', () => {
        document.querySelectorAll('.color-swatch').forEach(s => s.classList.remove('active'));
        swatch.classList.add('active');

        activeColor = item.color; // Eşleşme bulabilmek için ham datayı tutuyoruz
        selectedColorText.innerHTML = `Seçilen Renk: <strong>${item.colorName}</strong>`;

        // 3D MODELİ GERÇEK ZAMANLI BOYAMA (setStyle metodu RGB'yi çok daha sağlıklı okur)
        if (currentMesh) {
          currentMesh.material.color.setStyle(cssColor);
        }

        updatePriceAndValidation();
      });

      colorSwatchesContainer.appendChild(swatch);
    });

    updatePriceAndValidation();
  });

  infillInput.addEventListener('input', (e) => {
    infillVal.innerText = e.target.value;
    updatePriceAndValidation();
  });
  quantityInput.addEventListener('input', updatePriceAndValidation);

  fileInput.addEventListener('change', function (e) {
    const file = e.target.files[0];
    if (!file) return;

    const reader = new FileReader();
    reader.addEventListener('load', function (event) {
      const contents = event.target.result;
      const loader = new STLLoader();
      const geometry = loader.parse(contents);
      geometry.computeVertexNormals();
      geometry.center();

      if (currentMesh) scene.remove(currentMesh);

      currentMesh = new THREE.Mesh(geometry, new THREE.MeshStandardMaterial({ color: "#4f46e5", roughness: 0.4, metalness: 0.1 }));
      scene.add(currentMesh);

      // Mevcut seçili bir renk varsa boya (Eğer model yüklendiğinde malzeme/renk çoktan seçilmişse)
      if (activeColor !== "") {
        const selectedMat = filamentData.find(item => `${item.brand} ${item.material}` === materialSelect.value && item.color === activeColor);
        if (selectedMat) {
          const cssColor = selectedMat.colorCode.includes(',') ? `rgb(${selectedMat.colorCode})` : selectedMat.colorCode;
          currentMesh.material.color.setStyle(cssColor);
        }
      }

      modelVolumeCm3 = calculateVolume(geometry);
      volumeVal.innerText = modelVolumeCm3.toFixed(2);
      geometry.computeBoundingBox();
      geometry.boundingBox.getSize(modelSize);
      dimVal.innerText = `${modelSize.x.toFixed(1)} x ${modelSize.y.toFixed(1)} x ${modelSize.z.toFixed(1)}`;

      const maxDim = Math.max(modelSize.x, modelSize.y, modelSize.z);
      camera.position.set(maxDim * 1.5, maxDim * 1.5, maxDim * 1.5);
      controls.target.set(0, 0, 0);

      uploadOverlay.style.display = 'none';
      resetBtn.style.display = 'flex';
      updatePriceAndValidation();
    }, false);
    reader.readAsArrayBuffer(file);
  });

  resetBtn.addEventListener('click', () => {
    if (currentMesh) {
      scene.remove(currentMesh);
      currentMesh.geometry.dispose();
      currentMesh.material.dispose();
      currentMesh = null;
    }
    fileInput.value = "";
    modelVolumeCm3 = 0;
    modelSize.set(0, 0, 0);
    volumeVal.innerText = "0";
    dimVal.innerText = "0 x 0 x 0";
    totalPriceEl.innerText = "0.00 TL";
    quantityInput.value = "1";

    materialSelect.value = "";
    colorSwatchesContainer.innerHTML = '';
    activeColor = "";
    selectedColorText.innerText = "Önce Malzeme Seçin";

    orderBtn.disabled = true;
    alertBox.style.display = "none";
    uploadOverlay.style.display = 'block';
    resetBtn.style.display = 'none';
  });

  // ==========================================
  // EKRANLAR ARASI GEÇİŞ (3D -> Form)
  // ==========================================
  const calcView = document.getElementById('calculator-view');
  const checkoutView = document.getElementById('checkout-view');
  const backBtn = document.getElementById('back-to-calc-btn');

  orderBtn.addEventListener('click', () => {
    calcView.style.display = 'none';
    checkoutView.style.display = 'block';

    document.getElementById('summary-material').innerText = selectedMaterialText;
    document.getElementById('summary-infill').innerText = `%${infillInput.value}`;
    document.getElementById('summary-quantity').innerText = `${quantityInput.value} Adet`;
    document.getElementById('summary-volume').innerText = `${modelVolumeCm3.toFixed(2)} cm³`;
    document.getElementById('summary-price').innerText = totalPriceEl.innerText;

    window.scrollTo(0, 0);
  });

  backBtn.addEventListener('click', () => {
    checkoutView.style.display = 'none';
    calcView.style.display = 'block';
  });

  // ==========================================
  // FORM GÖRSELLİĞİ & KONTROLLERİ
  // ==========================================
  const bireyselRadio = document.querySelector('input[value="Bireysel"]');
  const kurumsalRadio = document.querySelector('input[value="Kurumsal"]');
  const bireyselFields = document.getElementById('bireysel-fields');
  const kurumsalFields = document.getElementById('kurumsal-fields');

  bireyselRadio.addEventListener('change', () => {
    bireyselFields.classList.remove('hidden-section');
    kurumsalFields.classList.add('hidden-section');
    document.getElementById('b-ad').required = true;
    document.getElementById('b-soyad').required = true;
    document.getElementById('k-isim').required = false;
    document.getElementById('k-vd').required = false;
    document.getElementById('k-vkn').required = false;
  });

  kurumsalRadio.addEventListener('change', () => {
    bireyselFields.classList.add('hidden-section');
    kurumsalFields.classList.remove('hidden-section');
    document.getElementById('b-ad').required = false;
    document.getElementById('b-soyad').required = false;
    document.getElementById('k-isim').required = true;
    document.getElementById('k-vd').required = true;
    document.getElementById('k-vkn').required = true;
  });

  const sameAddressCb = document.getElementById('same-address-cb');
  const shippingFields = document.getElementById('shipping-fields');

  sameAddressCb.addEventListener('change', (e) => {
    if (e.target.checked) {
      shippingFields.classList.add('hidden-section');
      document.getElementById('t-alici').required = false;
      document.getElementById('t-adres').required = false;
    } else {
      shippingFields.classList.remove('hidden-section');
      document.getElementById('t-alici').required = true;
      document.getElementById('t-adres').required = true;
    }
  });

  // ==========================================
  // DOSYA VE FORMU MAİLE GÖNDERME İŞLEMİ
  // ==========================================
  const checkoutForm = document.getElementById('checkout-form');
  const completeBtn = document.getElementById('complete-order-btn');

  checkoutForm.addEventListener('submit', async (e) => {
    e.preventDefault();

    completeBtn.innerText = "Gönderiliyor, lütfen bekleyin...";
    completeBtn.disabled = true;

    const formData = new FormData(checkoutForm);

    formData.append('Siparis_Malzemesi', selectedMaterialText);
    formData.append('Doluluk_Orani', `%${infillInput.value}`);
    formData.append('Hacim', `${modelVolumeCm3.toFixed(2)} cm3`);
    formData.append('Adet', quantityInput.value);
    formData.append('Toplam_Tutar', totalPriceEl.innerText);

    const stlFile = fileInput.files[0];
    if (stlFile) {
      formData.append('STL_Dosyasi', stlFile);
    }

    try {
      const response = await fetch(FORMSPREE_URL, {
        method: 'POST',
        body: formData,
        headers: { 'Accept': 'application/json' }
      });

      if (response.ok) {
        alert("Sipariş talebiniz başarıyla alındı! Mail adresinize dönüş yapılacaktır.");
        window.location.reload();
      } else {
        alert("Gönderim sırasında bir hata oluştu. Lütfen tekrar deneyin.");
        completeBtn.innerText = "Talebi Oluştur ve Gönder";
        completeBtn.disabled = false;
      }
    } catch (error) {
      alert("Bağlantı hatası. Lütfen internetinizi kontrol edin.");
      completeBtn.innerText = "Talebi Oluştur ve Gönder";
      completeBtn.disabled = false;
    }
  });
}
