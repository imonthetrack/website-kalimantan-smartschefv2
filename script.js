/* ============================================================
   Kalimantan SmartChef AI — script.js (refactored)
   Perbaikan:
   1. Threshold dinaikkan 30% → 60%
   2. Prediction loop dibatasi ~500ms (bukan 60fps)
   3. Prediction smoothing (rata-rata 8 frame terakhir)
   4. Error handling pada loadModel() & startCamera()
   5. Validasi nama kelas model vs allClasses (debug helper)
   6. Debounce pada handleUpload
   7. Loading indicator saat prediksi upload
   8. stopCamera() reset UI tombol
   9. Data resep dipisah ke object terpisah (lebih maintainable)
   ============================================================ */

const MODEL_URL = "https://teachablemachine.withgoogle.com/models/-Os3bG-3f/";

let model;
let isPredicting  = false;
let isFrozen      = false;
let stream        = null;
let isUploadMode  = false;

/* ── FIX 3: buffer untuk smoothing prediksi ── */
const SMOOTHING_FRAMES = 8;          // jumlah frame yang di-rata-rata
const predictionBuffer = [];         // array of prediction arrays

/* ── FIX 2: interval loop (ms) ── */
const PREDICT_INTERVAL_MS = 500;     // prediksi setiap 500ms, bukan tiap frame

/* ── FIX 1: threshold confidence ── */
const CONFIDENCE_THRESHOLD = 0.60;  // harus ≥ 60% untuk tampilkan resep

/* daftar semua makanan */
const allClasses = [
  "gangan humbut",
  "ketupat kandangan",
  "ikan baubar",
  "pais ikan",
  "ikan bakar sambal raja",
  "ikan patin bakar",
  "ikan papuyu masak kuning",
  "pindang ikan banjar",
  "ayam cincane",
  "ayam masak habang",
  "soto banjar",
  "kari ayam banjar",
  "ayam panggang banjar",
  "ayam kuah kuning",
  "udang masak habang",
  "udang galah bakar",
  "kepiting soka",
  "cumi masak hitam",
  "udang santan kuning",
  "nasi bekepor",
  "nasi kuning banjar",
  "nasi subut",
  "lontong orari",
  "nasi itik gambut",
  "ketupat kandangan set",
];

/* ============================================================
   DATA RESEP — dipisah supaya mudah di-maintain
   ============================================================ */
const menuData = {

  "gangan humbut": {
    img: "images/gangan-humbut.jpg",
    text: `
      <h2>Gangan Humbut</h2>
      <p class="desc">Masakan tradisional satu ini terkenal dengan kuah kuning segar, aroma rempah kuat, dan tekstur unik dari humbut (umbut kelapa muda). Rasanya gurih, sedikit asam, dan super comforting.</p>
      <h3>🧺 Bahan lengkap</h3>
      Bahan utama
      <ul>
        <li>300–400 gr humbut/umbut kelapa muda, iris tipis</li>
        <li>1 ekor ikan patin / ikan gabus (boleh diganti ayam kampung)</li>
        <li>1 liter air</li>
        <li>2 batang serai, memarkan</li>
        <li>2 lembar daun salam</li>
        <li>3 lembar daun jeruk</li>
        <li>1 ruas lengkuas, memarkan</li>
        <li>1 buah tomat, potong</li>
        <li>Garam &amp; gula secukupnya</li>
        <li>Air asam jawa atau belimbing wuluh (opsional)</li>
      </ul>
      Bumbu halus
      <ul>
        <li>6 siung bawang merah</li>
        <li>3 siung bawang putih</li>
        <li>3 butir kemiri</li>
        <li>2 cm kunyit</li>
        <li>1 cm jahe</li>
        <li>1 sdt ketumbar</li>
        <li>3–5 cabai merah (sesuaikan pedas)</li>
      </ul>
      <h3>🔥 Cara memasak</h3>
      <p>A. Rebus humbut 5–10 menit, tiriskan.<br>
      B. Tumis bumbu halus + serai, daun salam, daun jeruk, lengkuas hingga harum.<br>
      C. Tuang air, masukkan ikan, masak hingga setengah matang.<br>
      D. Masukkan humbut, tomat, garam, gula, asam jawa.<br>
      E. Masak ±15–20 menit hingga semua menyatu.</p>
      <h3>✨ Tips</h3>
      <ul>
        <li>Pakai humbut kelapa muda yang masih lembut.</li>
        <li>Ikan patin bikin kuah lebih gurih.</li>
        <li>Jangan pelit kunyit untuk warna kuning khas.</li>
      </ul>`
  },

  "ketupat kandangan": {
    img: "images/ketupat-kandangan.jpg",
    text: `
      <h2>Ketupat Kandangan</h2>
      <p class="desc">Menu legendaris dari tanah Banjar dengan kuah santan kuning gurih dan ikan haruan panggang yang smoky.</p>
      <h3>🧺 Bahan</h3>
      <ul>
        <li>4–6 buah ketupat matang</li>
        <li>2 ekor ikan haruan/gabus</li>
        <li>800 ml santan sedang + 500 ml santan kental</li>
        <li>Serai, daun salam, daun jeruk, lengkuas</li>
        <li>Garam &amp; gula secukupnya</li>
      </ul>
      Bumbu halus: bawang merah, bawang putih, kemiri, kunyit, jahe, ketumbar, merica, cabai merah.
      <h3>🔥 Cara memasak</h3>
      <p>A. Panggang ikan hingga setengah kering.<br>
      B. Tumis bumbu + rempah hingga matang.<br>
      C. Masukkan santan sedang + ikan panggang, masak api kecil.<br>
      D. Tambah santan kental, garam, gula hingga kuah mengental.</p>
      <h3>✨ Tips</h3>
      <ul>
        <li>Ikan haruan panggang adalah kunci rasa asli.</li>
        <li>Pakai santan segar kalau bisa.</li>
        <li>Masak api kecil agar santan tidak pecah.</li>
      </ul>`
  },

  "ikan baubar": {
    img: "images/ikan-baubar.jpg",
    text: `
      <h2>Ikan Baubar</h2>
      <p class="desc">Ikan Baubar dikenal dengan bumbu merah yang meresap sampai ke dalam daging ikan. Pedas gurih, sedikit manis, dan wangi bakaran.</p>
      <h3>🧺 Bahan</h3>
      <ul>
        <li>2 ekor ikan segar (nila/kembung/patin/kakap)</li>
        <li>Jeruk nipis, garam</li>
        <li>2 sdm kecap manis</li>
      </ul>
      Bumbu halus: bawang merah, bawang putih, cabai merah, cabai rawit, kemiri, kunyit, jahe, terasi bakar, gula merah, garam.
      <h3>🔥 Cara memasak</h3>
      <p>A. Lumuri ikan dengan jeruk nipis dan garam, diamkan 10–15 menit.<br>
      B. Tumis bumbu hingga matang, tambah kecap manis.<br>
      C. Oleskan bumbu ke ikan, marinasi 20–30 menit.<br>
      D. Bakar di atas arang, balik sambil dioles bumbu.</p>
      <h3>✨ Tips</h3>
      <ul>
        <li>Pakai arang untuk aroma smoky.</li>
        <li>Marinasi lebih lama = bumbu lebih meresap.</li>
      </ul>`
  },

  "pais ikan": {
    img: "images/pais-ikan.jpg",
    text: `
      <h2>Pais Ikan</h2>
      <p class="desc">Ikan berbumbu rempah dibungkus daun pisang lalu dikukus atau dibakar. Aromanya wangi, bumbunya meresap.</p>
      <h3>🧺 Bahan</h3>
      <ul>
        <li>3–4 potong ikan (patin/nila/gabus)</li>
        <li>Daun pisang secukupnya</li>
        <li>Jeruk nipis, garam</li>
      </ul>
      Bumbu halus: bawang merah, bawang putih, cabai merah, kemiri, kunyit, jahe, ketumbar, garam, gula.<br>
      Tambahan: serai iris, daun jeruk iris, daun bawang, kemangi.
      <h3>🔥 Cara memasak</h3>
      <p>A. Lumuri ikan dengan jeruk nipis dan garam.<br>
      B. Campur bumbu halus dengan bahan tambahan.<br>
      C. Bungkus ikan + bumbu dalam daun pisang yang sudah dilayukan.<br>
      D. Kukus 25–30 menit. Bisa dibakar sebentar setelahnya.</p>
      <h3>✨ Tips</h3>
      <ul>
        <li>Layukan daun pisang dulu agar tidak sobek.</li>
        <li>Kukus dulu baru bakar untuk aroma maksimal.</li>
      </ul>`
  },

  "ikan bakar sambal raja": {
    img: "images/raja.jpg",
    text: `
      <h2>Ikan Bakar Sambal Raja</h2>
      <p class="desc">Menu khas Kutai: ikan bakar gurih disiram sambal raja segar — perpaduan pedas, asam, dan wangi jeruk limau.</p>
      <h3>🧺 Bahan ikan</h3>
      <ul>
        <li>2 ekor ikan (nila/patin/kakap)</li>
        <li>Jeruk nipis, garam, kecap manis, margarin</li>
      </ul>
      Bumbu oles: bawang putih, bawang merah, kunyit, garam, kecap manis.
      <h3>🧺 Bahan Sambal Raja</h3>
      <ul>
        <li>Cabai merah keriting, cabai rawit, bawang merah iris, bawang putih iris</li>
        <li>Tomat, terasi bakar, gula merah, garam</li>
        <li>Jeruk limau, minyak panas</li>
      </ul>
      <h3>🔥 Cara memasak</h3>
      <p>A. Marinasi ikan 20–30 menit dengan bumbu oles.<br>
      B. Bakar di arang, oleskan bumbu beberapa kali.<br>
      C. Sambal raja: ulek kasar cabai + terasi, campur bawang & tomat, siram minyak panas, peras jeruk limau.</p>
      <h3>✨ Tips</h3>
      <ul>
        <li>Sambal raja jangan terlalu halus agar teksturnya terasa.</li>
        <li>Jeruk limau adalah kunci kesegaran khas Kutai.</li>
      </ul>`
  },

  "ikan patin bakar": {
    img: "images/ikan-patin-bakar.jpg",
    text: `
      <h2>Ikan Patin Bakar</h2>
      <p class="desc">Ikan patin punya tekstur lembut dan lemak alami yang bikin rasanya gurih banget. Dipadu bumbu rempah dan aroma bakaran.</p>
      <h3>🧺 Bahan</h3>
      <ul>
        <li>2 ekor ikan patin sedang</li>
        <li>Jeruk nipis, garam, kecap manis, margarin</li>
      </ul>
      Bumbu halus: bawang merah, bawang putih, cabai merah, kunyit, jahe, kemiri, ketumbar, garam, gula.
      <h3>🔥 Cara memasak</h3>
      <p>A. Lumuri ikan, diamkan 10 menit.<br>
      B. Tumis bumbu + serai + daun jeruk hingga matang.<br>
      C. Oleskan bumbu + kecap manis ke ikan, marinasi 30 menit.<br>
      D. Bakar sambil dioles beberapa kali.</p>
      <h3>✨ Tips</h3>
      <ul>
        <li>Jangan terlalu sering dibalik agar ikan tidak hancur.</li>
        <li>Pakai arang untuk aroma smoky khas.</li>
      </ul>`
  },

  "ikan papuyu masak kuning": {
    img: "images/ikan-papuyu-masak-kuning.jpg",
    text: `
      <h2>Ikan Papuyu Masak Kuning</h2>
      <p class="desc">Menu rumahan khas Banjar dengan kuah kuning segar, aroma kunyit kuat. Ikan papuyu (betok) teksturnya padat dan gurih.</p>
      <h3>🧺 Bahan</h3>
      <ul>
        <li>6–8 ekor ikan papuyu/betok</li>
        <li>1 liter air, serai, daun salam, daun jeruk, lengkuas</li>
        <li>Tomat, daun bawang, cabai rawit utuh (opsional)</li>
      </ul>
      Bumbu halus: bawang merah, bawang putih, kemiri, kunyit, jahe, ketumbar, cabai merah.
      <h3>🔥 Cara memasak</h3>
      <p>A. Lumuri ikan jeruk nipis + garam, diamkan 10 menit.<br>
      B. Tumis bumbu + rempah hingga harum.<br>
      C. Tuang air, masak hingga mendidih.<br>
      D. Masukkan ikan, masak 15 menit, tambah tomat &amp; daun bawang.</p>
      <h3>✨ Tips</h3>
      <ul>
        <li>Jangan terlalu sering diaduk agar ikan tidak hancur.</li>
        <li>Kunyit harus cukup agar warna kuning pekat.</li>
      </ul>`
  },

  "pindang ikan banjar": {
    img: "images/pindang-ikan-banjar.jpg",
    text: `
      <h2>Pindang Ikan Banjar</h2>
      <p class="desc">Kuah kuning segar yang gurih, sedikit asam, dan kaya rempah. Ringan tapi nendang.</p>
      <h3>🧺 Bahan</h3>
      <ul>
        <li>500 gr ikan (patin/gabus/nila)</li>
        <li>1 liter air, serai, daun salam, daun jeruk, lengkuas</li>
        <li>Air asam jawa / belimbing wuluh</li>
        <li>Tomat, cabai rawit, daun bawang</li>
      </ul>
      Bumbu halus: bawang merah, bawang putih, kunyit, jahe, kemiri, ketumbar, cabai merah.
      <h3>🔥 Cara memasak</h3>
      <p>A. Tumis bumbu + rempah hingga harum.<br>
      B. Tuang air, didihkan, masukkan ikan.<br>
      C. Tambah asam jawa, tomat, cabai rawit.<br>
      D. Masak 15 menit, masukkan daun bawang, angkat.</p>
      <h3>✨ Tips</h3>
      <ul>
        <li>Rasa harus seimbang: gurih, segar, sedikit asam.</li>
        <li>Kuah jangan terlalu kental.</li>
      </ul>`
  },

  "ayam cincane": {
    img: "images/ayam-cincane.jpg",
    text: `
      <h2>Ayam Cincane</h2>
      <p class="desc">Ikon kuliner Samarinda: warna merah menggoda, bumbu manis-gurih meresap, aroma bakaran yang kuat.</p>
      <h3>🧺 Bahan</h3>
      <ul>
        <li>1 ekor ayam, potong 4/8</li>
        <li>500 ml santan sedang</li>
        <li>2 sdm kecap manis, 1 sdm gula merah</li>
        <li>Serai, daun salam, daun jeruk</li>
      </ul>
      Bumbu halus: bawang merah, bawang putih, cabai merah, cabai rawit, kemiri, kunyit, jahe, ketumbar, garam.
      <h3>🔥 Cara memasak</h3>
      <p>A. Tumis bumbu + rempah.<br>
      B. Masak ayam dalam santan + kecap manis + gula merah hingga empuk.<br>
      C. Angkat ayam, bakar sambil dioles bumbu + margarin.</p>
      <h3>✨ Tips</h3>
      <ul>
        <li>Masak ayam dulu sebelum dibakar agar bumbu meresap.</li>
        <li>Gunakan arang untuk aroma smoky.</li>
      </ul>`
  },

  "ayam masak habang": {
    img: "images/ayam-masak-habang.jpg",
    text: `
      <h2>Ayam Masak Habang</h2>
      <p class="desc">Hidangan khas Banjar dengan warna merah pekat dari cabai kering. Manis, gurih, sedikit pedas.</p>
      <h3>🧺 Bahan</h3>
      <ul>
        <li>1 ekor ayam</li>
        <li>500 ml air, daun salam, serai</li>
        <li>1 sdm gula merah, 2 sdm kecap manis</li>
      </ul>
      Bumbu halus: bawang merah, bawang putih, 6 cabai merah kering (rendam), kemiri, jahe, ketumbar, garam.
      <h3>🔥 Cara memasak</h3>
      <p>A. Tumis bumbu + serai + daun salam.<br>
      B. Masukkan ayam, aduk rata.<br>
      C. Tuang air, tambah gula merah &amp; kecap manis.<br>
      D. Masak hingga empuk dan bumbu mengental.</p>
      <h3>✨ Tips</h3>
      <ul>
        <li>Cabai merah kering adalah kunci warna merah khas.</li>
        <li>Rasa harus dominan manis gurih.</li>
      </ul>`
  },

  "soto banjar": {
    img: "images/soto-banjar2.jpg",
    text: `
      <h2>Soto Banjar</h2>
      <p class="desc">Kuah bening kekuningan dengan aroma kayu manis dan cengkih yang khas. Disajikan dengan ayam suwir, ketupat, dan perkedel.</p>
      <h3>🧺 Bahan</h3>
      <ul>
        <li>1 ekor ayam</li>
        <li>2 liter air</li>
        <li>Serai, daun salam, daun jeruk, kayu manis, cengkih</li>
      </ul>
      Bumbu halus: bawang merah, bawang putih, kemiri, jahe, pala, merica.<br>
      Pelengkap: ketupat, telur rebus, perkedel, bawang goreng, seledri, sambal.
      <h3>🔥 Cara memasak</h3>
      <p>A. Rebus ayam, suwir dagingnya, saring kaldunya.<br>
      B. Tumis bumbu + rempah.<br>
      C. Gabungkan bumbu ke kaldu + ayam suwir.<br>
      D. Sajikan dengan pelengkap.</p>
      <h3>✨ Tips</h3>
      <ul>
        <li>Kayu manis dan cengkih wajib ada untuk aroma khas.</li>
        <li>Gunakan ayam kampung jika ada.</li>
      </ul>`
  },

  "kari ayam banjar": {
    img: "images/kari-ayam-banjar.jpg",
    text: `
      <h2>Kari Ayam Banjar</h2>
      <p class="desc">Kuah santan kuning yang gurih, wangi rempah, dan rasa hangat yang menempel di lidah.</p>
      <h3>🧺 Bahan</h3>
      <ul>
        <li>1 ekor ayam</li>
        <li>1 liter santan sedang + 300 ml santan kental</li>
        <li>Serai, daun salam, daun jeruk, lengkuas</li>
        <li>Kentang goreng, tomat</li>
      </ul>
      Bumbu halus: bawang merah, bawang putih, kemiri, kunyit, jahe, ketumbar, merica, cabai merah.
      <h3>🔥 Cara memasak</h3>
      <p>A. Tumis bumbu + rempah.<br>
      B. Masukkan ayam + santan sedang, masak api kecil.<br>
      C. Tambah santan kental + kentang goreng + tomat.<br>
      D. Masak hingga kuah mengental.</p>
      <h3>✨ Tips</h3>
      <ul>
        <li>Masak api kecil agar santan tidak pecah.</li>
        <li>Bumbu harus benar-benar matang sebelum santan masuk.</li>
      </ul>`
  },

  "ayam panggang banjar": {
    img: "images/ayam-panggang-banjar.jpg",
    text: `
      <h2>Ayam Panggang Banjar</h2>
      <p class="desc">Bumbu merah kecokelatan yang meresap sampai ke dalam. Manis gurih dengan aroma rempah dan bakaran yang kuat.</p>
      <h3>🧺 Bahan</h3>
      <ul>
        <li>1 ekor ayam</li>
        <li>500 ml air, kecap manis, gula merah</li>
        <li>Serai, daun salam, daun jeruk</li>
      </ul>
      Bumbu halus: bawang merah, bawang putih, cabai merah, kemiri, jahe, ketumbar, garam.
      <h3>🔥 Cara memasak</h3>
      <p>A. Tumis bumbu + rempah.<br>
      B. Masak ayam dengan air + kecap manis + gula merah hingga empuk.<br>
      C. Panggang sambil dioles bumbu + margarin hingga kecokelatan.</p>
      <h3>✨ Tips</h3>
      <ul>
        <li>Masak dulu sebelum dipanggang agar bumbu meresap.</li>
        <li>Gunakan arang untuk aroma smoky khas.</li>
      </ul>`
  },

  "ayam kuah kuning": {
    img: "images/ayam-kuah-kuning.jpg",
    text: `
      <h2>Ayam Kuah Kuning</h2>
      <p class="desc">Gurih hangat dengan aroma kunyit dan rempah yang ringan. Kuahnya segar tapi tetap kaya rasa.</p>
      <h3>🧺 Bahan</h3>
      <ul>
        <li>1 ekor ayam</li>
        <li>1 liter air, 300 ml santan (opsional)</li>
        <li>Serai, daun salam, daun jeruk, lengkuas</li>
        <li>Tomat, daun bawang, cabai rawit</li>
      </ul>
      Bumbu halus: bawang merah, bawang putih, kemiri, kunyit, jahe, ketumbar, merica.
      <h3>🔥 Cara memasak</h3>
      <p>A. Tumis bumbu + rempah, masukkan ayam.<br>
      B. Tuang air, masak hingga empuk.<br>
      C. Masukkan santan (jika pakai), tomat, cabai rawit, daun bawang.</p>
      <h3>✨ Tips</h3>
      <ul>
        <li>Kunyit harus cukup agar warna kuning keluar.</li>
        <li>Masak api kecil setelah santan masuk.</li>
      </ul>`
  },

  "udang masak habang": {
    img: "images/udang-masak-habang.jpg",
    text: `
      <h2>Udang Masak Habang</h2>
      <p class="desc">Versi seafood dari masakan habang khas Banjar. Merah pekat, manis gurih dengan rempah yang kuat.</p>
      <h3>🧺 Bahan</h3>
      <ul>
        <li>500 gr udang sedang</li>
        <li>200 ml air, daun salam, serai</li>
        <li>1 sdm gula merah, 1 sdm kecap manis</li>
      </ul>
      Bumbu halus: bawang merah, bawang putih, 6 cabai merah kering (rendam), kemiri, jahe, ketumbar, garam.
      <h3>🔥 Cara memasak</h3>
      <p>A. Tumis bumbu + serai + daun salam.<br>
      B. Masukkan udang, aduk cepat.<br>
      C. Tambah air, gula merah, kecap manis.<br>
      D. Masak hingga bumbu mengental dan menempel.</p>
      <h3>✨ Tips</h3>
      <ul>
        <li>Jangan masak udang terlalu lama agar tidak alot.</li>
        <li>Cabai merah kering = warna merah khas.</li>
      </ul>`
  },

  "udang galah bakar": {
    img: "images/udang-galah-bakar.jpg",
    text: `
      <h2>Udang Galah Bakar</h2>
      <p class="desc">Daging tebal, manis alami, makin mantap dibakar dengan bumbu gurih manis dan lelehan mentega.</p>
      <h3>🧺 Bahan</h3>
      <ul>
        <li>500 gr udang galah besar</li>
        <li>Jeruk nipis, garam, margarin, kecap manis</li>
      </ul>
      Bumbu halus: bawang merah, bawang putih, cabai merah, jahe, ketumbar, garam, gula.
      <h3>🔥 Cara memasak</h3>
      <p>A. Belah punggung udang, lumuri jeruk nipis + garam.<br>
      B. Campur bumbu tumis + kecap manis + margarin, oleskan ke udang, marinasi 20–30 menit.<br>
      C. Bakar sambil dioles, balik sekali saja.</p>
      <h3>✨ Tips</h3>
      <ul>
        <li>Belah punggung agar bumbu lebih meresap.</li>
        <li>Oles mentega di akhir pembakaran untuk rasa lebih gurih.</li>
      </ul>`
  },

  "kepiting soka": {
    img: "images/kepiting-soka.jpg",
    text: `
      <h2>Kepiting Soka</h2>
      <p class="desc">Kepiting bercangkang lunak yang bisa dimakan semuanya. Crispy di luar, lembut di dalam.</p>
      <h3>🧺 Bahan</h3>
      <ul>
        <li>4 ekor kepiting soka (soft shell crab)</li>
        <li>Tepung terigu, tepung maizena, merica, garam, air</li>
        <li>Minyak goreng</li>
      </ul>
      Saus (opsional): bawang putih, saus tomat, saus sambal, saus tiram, gula, air.
      <h3>🔥 Cara memasak</h3>
      <p>A. Lumuri kepiting jeruk nipis + garam, bilas.<br>
      B. Celup ke adonan tepung kental.<br>
      C. Goreng dalam minyak panas hingga golden crispy.<br>
      D. Tumis saus, masukkan kepiting, aduk cepat.</p>
      <h3>✨ Tips</h3>
      <ul>
        <li>Minyak harus benar-benar panas sebelum menggoreng.</li>
        <li>Tepung maizena = tekstur lebih renyah.</li>
      </ul>`
  },

  "cumi masak hitam": {
    img: "images/cumi-masak-hitam.jpg",
    text: `
      <h2>Cumi Masak Hitam</h2>
      <p class="desc">Kuah gelap khas dari tinta cumi, gurih, sedikit pedas, aromatik. Paling nikmat dengan nasi hangat.</p>
      <h3>🧺 Bahan</h3>
      <ul>
        <li>500 gr cumi segar (tintanya disimpan)</li>
        <li>200 ml air, daun salam, daun jeruk, serai</li>
        <li>Garam, gula, kaldu bubuk</li>
      </ul>
      Bumbu halus: bawang merah, bawang putih, cabai merah, cabai rawit, kemiri, jahe, kunyit, lengkuas.
      <h3>🔥 Cara memasak</h3>
      <p>A. Lumuri cumi jeruk nipis + garam, diamkan 10 menit.<br>
      B. Tumis bumbu + rempah hingga harum.<br>
      C. Masukkan cumi, aduk cepat, tuang air + tinta.<br>
      D. Masak ±15–20 menit hingga kuah mengental.</p>
      <h3>✨ Tips</h3>
      <ul>
        <li>Jangan masak cumi terlalu lama agar tidak alot.</li>
        <li>Tambah cabai rawit utuh untuk sensasi pedas khas Banjar.</li>
      </ul>`
  },

  "udang santan kuning": {
    img: "images/udang-kuah-santan-kuning.jpg",
    text: `
      <h2>Udang Santan Kuning</h2>
      <p class="desc">Berkuah santan kuning dari kunyit. Gurih, lembut, sedikit pedas, dan aromatik.</p>
      <h3>🧺 Bahan</h3>
      <ul>
        <li>500 gr udang segar</li>
        <li>500 ml santan, daun salam, daun jeruk, serai, tomat</li>
        <li>Garam, gula, kaldu bubuk</li>
      </ul>
      Bumbu halus: bawang merah, bawang putih, cabai merah, cabai rawit, kemiri, kunyit, jahe, lengkuas.
      <h3>🔥 Cara memasak</h3>
      <p>A. Tumis bumbu + rempah hingga harum.<br>
      B. Tuang santan, aduk perlahan.<br>
      C. Masukkan udang + tomat, bumbui.<br>
      D. Masak hingga udang matang dan kuah sedikit mengental.</p>
      <h3>✨ Tips</h3>
      <ul>
        <li>Aduk santan perlahan agar tidak pecah.</li>
        <li>Jangan masak udang terlalu lama.</li>
      </ul>`
  },

  "nasi bekepor": {
    img: "images/nasi-bekepor.jpg",
    text: `
      <h2>Nasi Bekepor</h2>
      <p class="desc">Nasi tradisional khas Kutai dimasak bersama rempah, santan, dan ikan asin. Gurih, harum, kaya bumbu.</p>
      <h3>🧺 Bahan</h3>
      <ul>
        <li>500 gr beras</li>
        <li>750 ml santan sedang + 200 ml air</li>
        <li>150 gr ikan asin (atau ayam suwir)</li>
        <li>Daun salam, daun jeruk, serai</li>
        <li>Garam &amp; gula secukupnya</li>
      </ul>
      Bumbu halus: bawang merah, bawang putih, cabai merah, kemiri, kunyit, jahe, lengkuas.
      <h3>🔥 Cara memasak</h3>
      <p>A. Tumis bumbu + rempah, tambah ikan asin, aduk rata.<br>
      B. Masukkan beras, tuang santan + air.<br>
      C. Masak seperti menanak nasi hingga air menyusut.<br>
      D. Tutup rapat, masak api kecil hingga matang.</p>
      <h3>✨ Tips</h3>
      <ul>
        <li>Goreng ikan asin dulu agar lebih harum.</li>
        <li>Sajikan dengan sambal raja dan lalapan.</li>
      </ul>`
  },

  "nasi kuning banjar": {
    img: "images/nasi-kuning-banjar.jpg",
    text: `
      <h2>Nasi Kuning Banjar</h2>
      <p class="desc">Nasi gurih berwarna kuning dari kunyit, dimasak dengan santan dan rempah khas Banjar.</p>
      <h3>🧺 Bahan</h3>
      <ul>
        <li>500 gr beras</li>
        <li>600 ml santan + 200 ml air</li>
        <li>Daun salam, daun jeruk, serai, garam, gula</li>
      </ul>
      Bumbu halus: bawang merah, bawang putih, kemiri, kunyit, jahe.
      <h3>🔥 Cara memasak</h3>
      <p>A. Tumis bumbu + rempah, masukkan beras, aduk rata.<br>
      B. Tuang santan + air, masak hingga air menyusut.<br>
      C. Kukus 15–20 menit hingga pulen.</p>
      <h3>✨ Tips</h3>
      <ul>
        <li>Kunyit segar = warna kuning lebih cerah.</li>
        <li>Kukus setelah air menyusut agar lebih pulen.</li>
      </ul>`
  },

  "nasi subut": {
    img: "images/nasi-subut.jpg",
    text: `
      <h2>Nasi Subut</h2>
      <p class="desc">Makanan tradisional Kalimantan Timur: campuran beras, jagung, dan ubi jalar. Gurih dan sedikit manis alami.</p>
      <h3>🧺 Bahan</h3>
      <ul>
        <li>300 gr beras, 200 gr jagung pipil, 200 gr ubi jalar</li>
        <li>800 ml air, garam, margarin</li>
        <li>Daun pandan, serai (opsional)</li>
      </ul>
      <h3>🔥 Cara memasak</h3>
      <p>A. Rebus jagung + ubi ±5 menit, tiriskan.<br>
      B. Masukkan semua bahan + air ke panci/rice cooker.<br>
      C. Masak seperti nasi biasa hingga matang, aduk rata.</p>
      <h3>✨ Tips</h3>
      <ul>
        <li>Pilih jagung muda untuk rasa manis alami lebih kuat.</li>
        <li>Enak dimakan dengan ikan asin goreng dan sambal pedas.</li>
      </ul>`
  },

  "lontong orari": {
    img: "images/lontong-orari.jpg",
    text: `
      <h2>Lontong Orari</h2>
      <p class="desc">Kuliner khas Banjar untuk sarapan: lontong dengan kuah santan gurih, sayur nangka, telur, dan ayam. Kaya rempah dan sedikit pedas.</p>
      <h3>🧺 Bahan</h3>
      <ul>
        <li>5 buah lontong</li>
        <li>500 ml santan + 200 ml air</li>
        <li>Telur rebus, ayam suwir (opsional)</li>
        <li>100 gr nangka muda / labu</li>
        <li>Daun salam, daun jeruk, serai</li>
      </ul>
      Bumbu halus: bawang merah, bawang putih, cabai merah, kemiri, kunyit, jahe.
      <h3>🔥 Cara memasak</h3>
      <p>A. Tumis bumbu + rempah, tambah nangka, aduk.<br>
      B. Tuang santan + air, masukkan ayam suwir, bumbui.<br>
      C. Masak hingga sayur empuk.<br>
      D. Siram di atas lontong, tambah telur rebus + sambal.</p>
      <h3>✨ Tips</h3>
      <ul>
        <li>Gunakan santan segar agar lebih gurih.</li>
        <li>Paling nikmat disantap hangat di pagi hari.</li>
      </ul>`
  },

  "nasi itik gambut": {
    img: "images/nasi-itik-gambut.jpg",
    text: `
      <h2>Nasi Itik Gambut</h2>
      <p class="desc">Hidangan khas Banjar dengan lauk itik berbumbu merah habang. Gurih, pedas, kaya rempah, dan daging itik yang empuk.</p>
      <h3>🧺 Bahan</h3>
      <ul>
        <li>1 ekor itik, potong</li>
        <li>1 liter air, daun salam, daun jeruk, serai</li>
        <li>Garam, gula merah, kaldu bubuk</li>
      </ul>
      Bumbu halus: bawang merah, bawang putih, cabai merah keriting, cabai rawit, kemiri, jahe, lengkuas, terasi.
      <h3>🔥 Cara memasak</h3>
      <p>A. Rebus itik sebentar untuk hilangkan bau, tiriskan.<br>
      B. Tumis bumbu + rempah, masukkan itik.<br>
      C. Tuang air + garam + gula merah + kaldu.<br>
      D. Masak api kecil hingga empuk dan kuah menyusut.</p>
      <h3>✨ Tips</h3>
      <ul>
        <li>Rebus itik dulu untuk kurangi bau khas.</li>
        <li>Masak lama agar bumbu benar-benar meresap.</li>
      </ul>`
  },

  "ketupat kandangan set": {
    img: "images/ketupat-kandangan-set.jpg",
    text: `
      <h2>Ketupat Kandangan (Set Lengkap)</h2>
      <p class="desc">Ketupat dengan ikan gabus asap dan kuah santan gurih. Kaya rempah, sedikit smoky, nikmat dimakan hangat.</p>
      <h3>🧺 Bahan</h3>
      <ul>
        <li>6 buah ketupat matang</li>
        <li>2 ekor ikan gabus asap</li>
        <li>700 ml santan + 300 ml air</li>
        <li>Daun salam, daun jeruk, serai, garam, gula</li>
      </ul>
      Bumbu halus: bawang merah, bawang putih, cabai merah, kemiri, kunyit, jahe.<br>
      Pelengkap set: telur rebus, bawang goreng, sambal merah, jeruk limau.
      <h3>🔥 Cara memasak</h3>
      <p>A. Tumis bumbu + rempah.<br>
      B. Tuang santan + air, masak perlahan.<br>
      C. Masukkan ikan gabus asap, bumbui, koreksi rasa.<br>
      D. Siram di atas ketupat, lengkapi dengan telur + sambal.</p>
      <h3>✨ Tips</h3>
      <ul>
        <li>Gunakan ikan gabus asap asli agar aroma smoky lebih terasa.</li>
        <li>Tambah perasan jeruk limau untuk rasa segar.</li>
      </ul>`
  },
};


/* ============================================================
   INISIALISASI
   ============================================================ */
document.addEventListener("DOMContentLoaded", () => {

  const startBtn        = document.getElementById("startBtn");
  const freezeBtn       = document.getElementById("freezeBtn");
  const uploadBtn       = document.getElementById("uploadBtn");
  const uploadResumeBtn = document.getElementById("uploadResumeBtn");
  const imageUpload     = document.getElementById("imageUpload");

  /* ── UI OBSERVERS (dipindahkan dari inline script di HTML) ── */
  const cameraContainer  = document.getElementById("cameraContainer");
  const cameraIdle       = document.getElementById("cameraIdle");
  const loadingOverlay   = document.getElementById("loadingOverlay");
  const foodImgPlaceholder = document.getElementById("foodImgPlaceholder");
  const foodImg          = document.getElementById("foodImage");
  const videoEl          = document.getElementById("camera");
  const uploadPreviewEl  = document.getElementById("uploadPreview");

  /* Tampilkan loading + aktifkan border saat tombol Start diklik */
  startBtn.addEventListener("click", () => {
    loadingOverlay.classList.add("show");
    cameraContainer.classList.add("active");
  });

  /* Sembunyikan idle + loading saat video mulai play */
  videoEl.addEventListener("play", () => {
    cameraIdle.style.display = "none";
    loadingOverlay.classList.remove("show");
  });

  /* Sembunyikan idle saat upload preview tampil */
  const uploadObserver = new MutationObserver(() => {
    if (uploadPreviewEl.style.display === "block") {
      cameraIdle.style.display = "none";
      cameraContainer.classList.add("active");
      loadingOverlay.classList.remove("show");
    }
  });
  uploadObserver.observe(uploadPreviewEl, { attributes: true, attributeFilter: ["style"] });

  /* Sembunyikan placeholder gambar saat foto makanan tampil */
  const foodImgObserver = new MutationObserver(() => {
    if (foodImg.style.display === "block") {
      foodImgPlaceholder.style.display = "none";
    }
  });
  foodImgObserver.observe(foodImg, { attributes: true, attributeFilter: ["style"] });

  startBtn.addEventListener("click", startCamera);

  freezeBtn.addEventListener("click", () => {
    if (!isFrozen) {
      isFrozen = true;
      freezeBtn.innerText = "Resume";
    } else {
      isFrozen = false;
      freezeBtn.innerText = "Freeze";
      schedulePrediction();
    }
  });

  uploadBtn.addEventListener("click", () => {
    imageUpload.click();
  });

  uploadResumeBtn.addEventListener("click", resumeCameraFromUpload);

  /* FIX 6: debounce upload agar tidak trigger prediksi ganda */
  let uploadDebounceTimer = null;
  imageUpload.addEventListener("change", (e) => {
    clearTimeout(uploadDebounceTimer);
    uploadDebounceTimer = setTimeout(() => handleUpload(e), 200);
  });

  initProgressBars();

  /* FIX 5: validasi nama kelas model vs allClasses di console */
  _validateClassNames();
});


/* ============================================================
   LOAD MODEL
   FIX 4: try/catch + loading indicator
   ============================================================ */
async function loadModel() {
  if (model) return; /* sudah di-load, skip */

  try {
    setStatus("Memuat model AI…");
    const modelURL    = MODEL_URL + "model.json";
    const metadataURL = MODEL_URL + "metadata.json";
    model = await tmImage.load(modelURL, metadataURL);
    setStatus("Model siap");
  } catch (err) {
    model = null;
    setStatus("Gagal memuat model");
    throw new Error("Gagal memuat model AI: " + err.message);
  }
}


/* ============================================================
   KAMERA
   ============================================================ */
async function startCamera() {
  const btn   = document.getElementById("startBtn");
  const video = document.getElementById("camera");
  const img   = document.getElementById("uploadPreview");

  btn.disabled   = true;
  btn.innerText  = "Loading…";

  try {
    await loadModel();

    stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: "environment" },
      audio: false,
    });

    video.srcObject   = stream;
    video.style.display = "block";
    img.style.display   = "none";

    video.onloadeddata = () => {
      isPredicting = true;
      predictionBuffer.length = 0; /* reset buffer saat kamera mulai */
      schedulePrediction();
    };

    btn.innerText = "Kamera Aktif";
    document.getElementById("freezeBtn").disabled = false;

  } catch (err) {
    alert("Kamera gagal: " + err.message);
    btn.disabled  = false;
    btn.innerText = "Start Kamera";
    setStatus("Kamera gagal");
  }
}


/* FIX 8: stopCamera reset UI */
function stopCamera() {
  if (stream) {
    stream.getTracks().forEach(track => track.stop());
    stream = null;
  }
  isPredicting = false;

  /* reset tombol ke kondisi awal */
  const startBtn  = document.getElementById("startBtn");
  const freezeBtn = document.getElementById("freezeBtn");
  startBtn.disabled   = false;
  startBtn.innerText  = "Start Kamera";
  freezeBtn.disabled  = true;
  freezeBtn.innerText = "Freeze";
  isFrozen = false;
}


/* ============================================================
   PREDICTION LOOP
   FIX 2: ganti requestAnimationFrame → setTimeout (500ms)
   FIX 3: smoothing dengan rata-rata N frame terakhir
   ============================================================ */
function schedulePrediction() {
  if (!isPredicting || isFrozen) return;
  setTimeout(runPrediction, PREDICT_INTERVAL_MS);
}

async function runPrediction() {
  if (!isPredicting || isFrozen) return;

  const video = document.getElementById("camera");

  try {
    const rawPrediction = await model.predict(video);

    /* FIX 3: tambahkan frame ke buffer */
    predictionBuffer.push(rawPrediction);
    if (predictionBuffer.length > SMOOTHING_FRAMES) {
      predictionBuffer.shift(); /* buang frame paling lama */
    }

    /* hitung rata-rata probabilitas dari semua frame di buffer */
    const smoothed = computeSmoothedPrediction(predictionBuffer);
    updatePredictionBars(smoothed);

  } catch (err) {
    console.warn("Prediksi gagal:", err.message);
  }

  schedulePrediction(); /* jadwal berikutnya */
}

/**
 * Hitung rata-rata probabilitas dari array of prediction arrays.
 * @param {Array} buffer - array of prediction arrays
 * @returns {Array} - prediction array dengan probabilitas dirata-rata
 */
function computeSmoothedPrediction(buffer) {
  if (buffer.length === 0) return [];

  /* ambil nama kelas dari frame pertama */
  const classNames = buffer[0].map(p => p.className);

  return classNames.map((name, i) => {
    const avgProbability =
      buffer.reduce((sum, frame) => sum + (frame[i]?.probability || 0), 0) /
      buffer.length;
    return { className: name, probability: avgProbability };
  });
}


/* ============================================================
   UPLOAD GAMBAR
   FIX 7: loading indicator saat prediksi upload
   ============================================================ */
async function handleUpload(event) {
  const file = event.target.files[0];
  if (!file) return;

  /* reset value agar event change bisa trigger lagi untuk file yang sama */
  event.target.value = "";

  try {
    await loadModel();
  } catch (err) {
    alert(err.message);
    return;
  }

  stopCamera();
  isUploadMode = true;
  document.getElementById("uploadResumeBtn").disabled = false;

  const img   = document.getElementById("uploadPreview");
  const video = document.getElementById("camera");

  img.src = window.URL.createObjectURL(file);

  img.onload = async () => {
    img.style.display   = "block";
    video.style.display = "none";

    /* FIX 7: tunjukkan status loading */
    setStatus("Menganalisa gambar…");
    document.getElementById("resultText").innerText = "Menganalisa…";

    try {
      const prediction = await model.predict(img);
      /* upload = prediksi tunggal, tidak perlu buffer */
      updatePredictionBars(prediction);
    } catch (err) {
      setStatus("Prediksi gagal");
      document.getElementById("resultText").innerText =
        "Gagal menganalisa gambar. Coba lagi.";
    }
  };
}


/* ============================================================
   RESUME KAMERA DARI MODE UPLOAD
   ============================================================ */
function resumeCameraFromUpload() {
  if (!isUploadMode) return;

  const img   = document.getElementById("uploadPreview");
  const video = document.getElementById("camera");

  img.style.display   = "none";
  video.style.display = "block";

  isUploadMode = false;
  predictionBuffer.length = 0; /* reset buffer */

  startCamera();
  document.getElementById("uploadResumeBtn").disabled = true;
}


/* ============================================================
   INIT PROGRESS BAR (kosong saat pertama buka)
   ============================================================ */
function initProgressBars() {
  const container = document.getElementById("predictionList");
  container.innerHTML = "";

  allClasses.forEach(name => {
    const item = document.createElement("div");
    item.className = "prediction-item";
    item.innerHTML = `
      <div class="prediction-label">
        <span>${name}</span>
        <span>0%</span>
      </div>
      <div class="prediction-bar">
        <div class="prediction-fill" style="width:0%"></div>
      </div>`;
    container.appendChild(item);
  });
}


/* ============================================================
   UPDATE PREDICTION BARS
   FIX 1: threshold 30% → CONFIDENCE_THRESHOLD (60%)
   ============================================================ */
function updatePredictionBars(predictions) {
  const container = document.getElementById("predictionList");

  /* ubah array prediksi jadi map */
  const predictionMap = {};
  predictions.forEach(p => {
    predictionMap[p.className.toLowerCase()] = p.probability;
  });

  /* gabungkan dengan allClasses */
  const merged = allClasses.map(name => ({
    className:   name,
    probability: predictionMap[name] || 0,
  }));

  /* urutkan tertinggi ke terendah */
  merged.sort((a, b) => b.probability - a.probability);

  container.innerHTML = "";

  merged.forEach((pred, index) => {
    const percent = Math.round(pred.probability * 100);
    const item    = document.createElement("div");
    item.className = "prediction-item";

    if (index === 0) item.classList.add("top");

    item.innerHTML = `
      <div class="prediction-label">
        <span>${pred.className}</span>
        <span>${percent}%</span>
      </div>
      <div class="prediction-bar">
        <div class="prediction-fill" style="width:${percent}%"></div>
      </div>`;

    container.appendChild(item);

    /* update confidence bar dan tampilkan resep hanya untuk top-1 */
    if (index === 0) {
      document.getElementById("confidenceFill").style.width = percent + "%";
      document.getElementById("confidenceText").innerText   = percent + "%";

      const statusText = document.getElementById("aiStatusText");

      /* FIX 1: gunakan CONFIDENCE_THRESHOLD */
      if (pred.probability >= CONFIDENCE_THRESHOLD) {
        statusText.innerText = "AI Aktif";
        showMenu(pred.className.toLowerCase());
      } else {
        /* tampilkan pesan berbeda berdasarkan seberapa dekat threshold */
        if (pred.probability >= 0.40) {
          statusText.innerText = "Mendekati…";
          document.getElementById("resultText").innerText =
            `Kemungkinan: ${pred.className} (${percent}%) — Dekatkan kamera atau perjelas gambar.`;
        } else {
          statusText.innerText = "Menganalisa…";
          document.getElementById("resultText").innerText =
            "Arahkan kamera lebih dekat ke makanan.";
        }
      }
    }
  });
}


/* ============================================================
   TAMPILKAN RESEP
   Data diambil dari menuData (dipisah di atas)
   ============================================================ */
function showMenu(menu) {
  const resultBox = document.getElementById("resultText");
  const foodImage = document.getElementById("foodImage");
  const item      = menuData[menu];

  if (item) {
    resultBox.innerHTML     = item.text;
    foodImage.src           = item.img;
    foodImage.style.display = "block";
  } else {
    resultBox.innerText = "Objek terdeteksi: " + menu;
    console.warn(`showMenu: tidak ada data untuk key "${menu}"`);
  }
}


/* ============================================================
   HELPER: set status text
   ============================================================ */
function setStatus(text) {
  const el = document.getElementById("aiStatusText");
  if (el) el.innerText = text;
}


/* ============================================================
   FIX 5: validasi nama kelas model vs allClasses (debug)
   Cek di console apakah ada mismatch
   ============================================================ */
async function _validateClassNames() {
  /* jalankan hanya jika model sudah ada */
  if (!model) return;
  const modelClasses = model.getClassLabels
    ? model.getClassLabels()
    : [];
  if (modelClasses.length === 0) return;

  modelClasses.forEach(cls => {
    if (!allClasses.includes(cls.toLowerCase())) {
      console.warn(`[Validasi] Kelas model "${cls}" tidak ada di allClasses!`);
    }
  });

  allClasses.forEach(cls => {
    if (!modelClasses.map(c => c.toLowerCase()).includes(cls)) {
      console.warn(`[Validasi] allClasses "${cls}" tidak ada di model!`);
    }
  });
}


/* ============================================================
   MUSIK
   ============================================================ */
const music    = document.getElementById("bgMusic");
const musicBtn = document.getElementById("musicBtn");
let musicPlaying = true;

window.addEventListener("load", () => {
  const playPromise = music.play();
  if (playPromise !== undefined) {
    playPromise.catch(() => {
      /* browser blok autoplay → tunggu interaksi user */
      document.addEventListener("click", () => music.play(), { once: true });
    });
  }
});

musicBtn.addEventListener("click", () => {
  if (musicPlaying) {
    music.pause();
    musicBtn.innerText = "🔇";
    musicPlaying = false;
  } else {
    music.play();
    musicBtn.innerText = "🔊";
    musicPlaying = true;
  }
});

music.addEventListener("ended", () => {
  music.currentTime = 0;
  music.play();
});

const bahanIkonikList = [
  { bahan: ["humbut", "rebung"], menu: "Gangan Humbut" },
  { bahan: ["ikan haruan", "gabus"], menu: "Ketupat Kandangan" },
  { bahan: ["terong asam"], menu: "Ikan Baubar" },
  { bahan: ["daun pisang"], menu: "Pais Ikan" },
  { bahan: ["sambal raja"], menu: "Ikan Bakar Sambal Raja" },
  { bahan: ["ikan patin"], menu: "Ikan Patin Bakar" },
  { bahan: ["ikan papuyu"], menu: "Ikan Papuyu Masak Kuning" },
  { bahan: ["asam jawa"], menu: "Pindang Ikan Banjar" },
  { bahan: ["ayam kampung"], menu: "Ayam Cincane" },
  { bahan: ["cabai habang"], menu: "Ayam Masak Habang" },
  { bahan: ["bihun"], menu: "Soto Banjar" },
  { bahan: ["bubuk kari"], menu: "Kari Ayam Banjar" },
  { bahan: ["kecap manis"], menu: "Ayam Panggang Banjar" },
  { bahan: ["kunyit"], menu: "Ayam Kuah Kuning" },
  { bahan: ["udang sungai"], menu: "Udang Masak Habang" },
  { bahan: ["udang galah"], menu: "Udang Galah Bakar" },
  { bahan: ["kepiting"], menu: "Kepiting Soka" },
  { bahan: ["tinta cumi"], menu: "Cumi Masak Hitam" },
  { bahan: ["santan"], menu: "Udang Santan Kuning" },
  { bahan: ["ikan asin"], menu: "Nasi Bekepor" },
  { bahan: ["beras ketan"], menu: "Nasi Kuning Banjar" },
  { bahan: ["labu kuning"], menu: "Nasi Subut" },
  { bahan: ["lontong"], menu: "Lontong Orari" },
  { bahan: ["daging itik"], menu: "Nasi Itik Gambut" },
  { bahan: ["ketupat"], menu: "Ketupat Kandangan Set" }
];
let bahanVisible = false;

document.getElementById("bahanBtn").addEventListener("click", () => {
  const container = document.getElementById("bahanList");

  if (!bahanVisible) {
    let html = "<strong>Bahan Ikonik AI:</strong><br><br>";

    for (let item of bahanIkonikList) {
      html += `• ${item.bahan.join(" / ")} → ${item.menu}<br>`;
    }

    container.innerHTML = html;
    bahanVisible = true;
  } else {
    container.innerHTML = "";
    bahanVisible = false;
  }
});

window.addEventListener("DOMContentLoaded", () => {

  const slider = document.getElementById("introSlider");
  const popup = document.getElementById("introPopup");
  const dotsContainer = document.getElementById("introDots");

  const nextBtn = document.getElementById("nextSlide");
  const prevBtn = document.getElementById("prevSlide");
  const acceptBtn = document.getElementById("acceptIntro");
  const openBtn = document.getElementById("openIntroBtn");

  if (!slider) return; // cegah error

  let currentIndex = 0;
  const slides = document.querySelectorAll(".intro-slide");
  const totalSlides = slides.length;

  // DOTS
  for (let i = 0; i < totalSlides; i++) {
    const dot = document.createElement("span");
    if (i === 0) dot.classList.add("active");
    dotsContainer.appendChild(dot);
  }

  function updateSlider() {
    slider.style.transform = `translateX(-${currentIndex * 100}%)`;

    const dots = dotsContainer.querySelectorAll("span");
    dots.forEach(d => d.classList.remove("active"));
    dots[currentIndex].classList.add("active");
  }

  // NEXT
  nextBtn.onclick = () => {
    if (currentIndex < totalSlides - 1) {
      currentIndex++;
      updateSlider();
    } else {
      popup.style.display = "none";
      localStorage.setItem("introShown", "true");
    }
  };

  // PREV
  prevBtn.onclick = () => {
    if (currentIndex > 0) {
      currentIndex--;
      updateSlider();
    }
  };

  // ACCEPT
  acceptBtn.onclick = () => {
    popup.style.display = "none";
    localStorage.setItem("introShown", "true");
  };

  // BUKA LAGI
  openBtn.onclick = () => {
    popup.style.display = "flex";
    currentIndex = 0;
    updateSlider();
  };

  // SWIPE
  let startX = 0;

  slider.addEventListener("touchstart", e => {
    startX = e.touches[0].clientX;
  });

  slider.addEventListener("touchend", e => {
    let endX = e.changedTouches[0].clientX;

    if (startX - endX > 50 && currentIndex < totalSlides - 1) {
      currentIndex++;
    } else if (endX - startX > 50 && currentIndex > 0) {
      currentIndex--;
    }

    updateSlider();
  });

  // AUTO SHOW
  if (!localStorage.getItem("introShown")) {
    popup.style.display = "flex";
  }

});
