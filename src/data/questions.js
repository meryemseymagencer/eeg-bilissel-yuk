// ============================================================================
// Bilişsel Yük Odaklı Soru Veritabanı — Uzamsal + Bellek
// EEG + NASA-TLX Çalışması | Kocaeli Üniversitesi
// Etik Kurul Onaylı Protokol
// ----------------------------------------------------------------------------
// Kategori U : Uzamsal-Görsel (zihinsel döndürme, katlama, örüntü)
// Kategori B : Bellek (Basit tanıma, Sternberg, N-back, Sıra hatırlama)
//
// Tüm cevaplar buton tıklaması ile verilir — klavye etkileşimi yok (EEG)
// ============================================================================

export const questions = {

  // ==========================================================================
  // KOLAY — Düşük bilişsel yük
  // ==========================================================================
  kolay: [

    // ── Uzamsal ──────────────────────────────────────────────────────────────
    {
      id: 1,
      question: 'Aşağıdaki L şekli saat yönünde 90°döndürüldüğünde şeklin <em>üst kenarı</em> hangi yöne gelir?',
      gorsel: {
        tip: 'html',
        icerik: `
          <div class="visual-row">
            <div class="visual-box">
              <svg width="80" height="80" viewBox="0 0 80 80">
                <rect x="10" y="10" width="20" height="60" fill="#6c63ff"/>
                <rect x="10" y="50" width="60" height="20" fill="#6c63ff"/>
              </svg>
            </div>
            <div class="visual-arrow">→ <span style="font-size:0.8rem">90° saat yönünde</span></div>
            <div class="visual-box">
              <div class="question-mark-box">?</div>
            </div>
          </div>`
      },
      options: ['Sola', 'Sağa', 'Yukarı', 'Aşağı'],
      correctAnswer: 1,
      points: 10,
      category: 'U',
      difficulty: 'kolay'
    },

    {
      id: 2,
      question: 'Kare bir kağıdı tam ortadan yatay olarak kesiyorsun. Elde edilen iki parçanın her biri hangi tür dörtgendir?',
      gorsel: {
        tip: 'html',
        icerik: `
          <div class="visual-row">
            <div class="visual-box">
              <span class="visual-label">Orijinal</span>
              <svg width="80" height="80" viewBox="0 0 80 80">
                <rect x="5" y="5" width="70" height="70" fill="none" stroke="#6c63ff" stroke-width="3"/>
                <line x1="5" y1="40" x2="75" y2="40" stroke="#ff6584" stroke-width="2" stroke-dasharray="6,3"/>
              </svg>
            </div>
            <div class="visual-arrow">→ kesilir</div>
            <div class="visual-box">
              <svg width="80" height="80" viewBox="0 0 80 80">
                <rect x="5" y="5" width="70" height="30" fill="none" stroke="#6c63ff" stroke-width="3"/>
                <text x="40" y="26" text-anchor="middle" fill="#999" font-size="14">?</text>
                <rect x="5" y="45" width="70" height="30" fill="none" stroke="#6c63ff" stroke-width="3"/>
                <text x="40" y="66" text-anchor="middle" fill="#999" font-size="14">?</text>
              </svg>
            </div>
          </div>`
      },
      options: ['Kare', 'Dikdörtgen', 'Eşkenar dörtgen', 'Yamuk'],
      correctAnswer: 1,
      points: 10,
      category: 'U',
      difficulty: 'kolay'
    },

    {
      id: 4,
      question: '3×3 kare ızgarada sol üst köşeden sağ alt köşeye çekilen köşegen üzerinden geçtiği karelerin sayısı açtır?',
      gorsel: {
        tip: 'html',
        icerik: `
          <div class="visual-row" style="justify-content:center;">
            <div class="visual-box">
              <span class="visual-label">3×3 Izgara</span>
              <svg width="90" height="90" viewBox="0 0 90 90">
                ${[0,1,2].map(r => [0,1,2].map(c =>
                  `<rect x="${5+c*27}" y="${5+r*27}" width="25" height="25" fill="${(r===c)?'rgba(108,99,255,0.25)':'none'}" stroke="#555" stroke-width="1.5"/>`
                ).join('')).join('')}
                <line x1="5" y1="5" x2="83" y2="83" stroke="#ff6584" stroke-width="2.5"/>
              </svg>
            </div>
          </div>`
      },
      options: ['2', '3', '4', '5'],
      correctAnswer: 1,
      points: 10,
      category: 'U',
      difficulty: 'kolay'
    },

    // ── Bellek — Düşük ────────────────────────────────────────────────────────
 {
      id: 11,
      question: 'Az önce gösterilen harfler arasında <strong>K</strong> var mıydı?', // Gramer düzeltildi: var mıydı
      stimType: 'sequence',              // ⚡ 'simple' yerine 'sequence' yaptık, böylece sırayla dönecek
      stimDur: 4000,                     // ⚡ Toplam süre (Her harf için 1500ms + aradaki boşluklar için artırıldı)
      stimItemDur: 1500,                 // Protokolündeki Owen vd. standardı: Her harf ekranda 1.5 sn kalır
      stimItemGap: 300,                  // Harfler arası 300ms ekran boş kalır (ISI)
      retentionDur: 1500,                // Harfler bitince soru gelmeden önce 1.5 sn bekleme süresi
      taskHint: 'Çıkan harfleri sırayla aklınızda tutun.',
      taskReminder: 'Görev: Çıkan harfleri hatırlayın',
      items: ['K', 'M'],                 // ⚡ Harfleri diziye ayırdık. Önce K, sonra M tek tek ekrana gelecek
      options: ['Evet', 'Hayır'],
      correctAnswer: 0,
      points: 10,
      category: 'B',
      difficulty: 'kolay'
    },
    {
      id: 13,
      question: 'Az önce gösterilen sayı <strong>7</strong> miydi?',
      stimType: 'simple',
      stimDur: 2000,
      stimMain: '7',
      taskHint: 'Çıkan sayıyı aklınızda tutun.',
      taskReminder: 'Görev: Çıkan sayıyı hatırlayın',
      options: ['Evet', 'Hayır'],
      correctAnswer: 0,
      points: 10,
      category: 'B',
      difficulty: 'kolay'
    },

    {
      id: 14,
      question: 'Dizinin son kelimesi neydi?',
      stimType: 'sequence',
      stimDur: 6000,                    // Toplam süre (3 kelime × 1500ms + buffer)
      stimItemDur: 1500,                // ⚡ YENİ: Her kelime 1500ms (Owen vd. 2005)
      stimItemGap: 300,                 // ⚡ YENİ: Kelimeler arası 300ms boşluk
      retentionDur: 1500,               // ⚡ YENİ: Bitince 1.5sn bekleme
      taskHint: 'Çıkan kelimeleri sırayla ezberleyin.',
      taskReminder: 'Görev: Dizinin son kelimesini aklınızda tutun',
      items: ['Elma', 'Armut', 'Kiraz'],
      options: ['Elma', 'Armut', 'Kiraz', 'Üzüm'],
      correctAnswer: 2,
      points: 10,
      category: 'B',
      difficulty: 'kolay'
    },

    {
      id: 15,
      question: 'Bu dizide kaç tane bir öncekiyle aynı harf vardı?',
      stimType: 'nback',
      stimDur: 8000,                    // Toplam (4 harf × ~1800ms)
      stimItemDur: 1500,                // ⚡ YENİ: Her harf 1500ms (Owen standart)
      stimItemGap: 300,                 // ⚡ YENİ: Harfler arası 300ms boşluk (ISI)
      retentionDur: 1500,               // ⚡ YENİ: Bekleme 1.5sn
      n_val: 1,
      taskReminder: 'Görev: Kaç adet ardışık eşleşme olduğunu sayın.',
      items: ['A', 'B', 'B', 'C'],      // 1-back eşleşme: B-B = 1
      options: ['0', '1', '2', '3'],
      correctAnswer: 1,
      points: 10,
      category: 'B',
      difficulty: 'kolay'
    },

    {
      id: 16,
      question: 'Az önce gösterilen renk <strong>YEŞİL</strong> miydi?',
      stimType: 'simple',
      stimDur: 2000,
      stimMain: 'MAVİ',
      taskHint: 'Çıkan rengi aklınızda tutun.',
      taskReminder: 'Görev: Çıkan rengi hatırlayın',
      options: ['Evet', 'Hayır'],
      correctAnswer: 1,
      points: 10,
      category: 'B',
      difficulty: 'kolay'
    }
  ],

  // ==========================================================================
  // ORTA — Orta bilişsel yük
  // ==========================================================================
  orta: [

    // ── Uzamsal ──────────────────────────────────────────────────────────────
    {
      id: 5,
      question: 'A4 kağıdını önce sağdan sola, sonra yukarıdan aşağı katla. Katlanmış halinin sağ alt köşesine tek bir delik açılır. Kağıt tamamen açıldığında kaç delik oluşur?',
      gorsel: {
        tip: 'html',
        icerik: `
          <div class="visual-row folding-steps">
            <div class="visual-box">
              <svg width="70" height="90" viewBox="0 0 70 90">
                <rect x="2" y="2" width="66" height="86" fill="none" stroke="#6c63ff" stroke-width="2"/>
                <line x1="35" y1="2" x2="35" y2="88" stroke="#ff6584" stroke-width="2" stroke-dasharray="5,3"/>
              </svg>
            </div>
            <div class="visual-arrow">→</div>
            <div class="visual-box">
              <svg width="45" height="90" viewBox="0 0 45 90">
                <rect x="2" y="2" width="41" height="86" fill="none" stroke="#6c63ff" stroke-width="2"/>
                <line x1="2" y1="45" x2="43" y2="45" stroke="#ff6584" stroke-width="2" stroke-dasharray="5,3"/>
              </svg>
            </div>
            <div class="visual-arrow">→</div>
            <div class="visual-box">
              <svg width="45" height="50" viewBox="0 0 45 50">
                <rect x="2" y="2" width="41" height="46" fill="none" stroke="#6c63ff" stroke-width="2"/>
                <circle cx="37" cy="42" r="5" fill="#ff6584"/>
              </svg>
            </div>
            <div class="visual-arrow">→</div>
            <div class="visual-box">
              <div class="question-mark-box">?</div>
            </div>
          </div>`
      },
      options: ['1 delik, tam ortada', '2 delik, üst ve alt ortada', '3 delik, L şeklinde', '4 delik, köşelerde simetrik'],
      correctAnswer: 3,
      points: 20,
      category: 'U',
      difficulty: 'orta'
    },

    {
        id: 7,
        question: '3, 6, 12, 24 dizisinde gelecek iki sonraki sayının toplamı nedir?',
        options: ['72', '96', '144', '192'], 
        correctAnswer: 2, 
        points: 20,
        category: 'A', 
        difficulty: 'orta'
    },
    // ── Bellek — Orta ─────────────────────────────────────────────────────────
    {
      id: 21,
      question: 'Bu dizide kaç tane 2 adım önceki ile aynı harf vardı?',
      stimType: 'nback',
      stimDur: 12000,                   // 6 harf × ~2sn
      stimItemDur: 1500,                // ⚡ Owen vd. standart
      stimItemGap: 300,
      retentionDur: 2000,
      n_val: 2,
      taskReminder: 'Görev: 2 adım önceki ile aynı harf zihinde sayın',
      items: ['K', 'M', 'P', 'M', 'K', 'M'],  // 2-back eşleşmeleri: M-M(idx3,1), M-M(idx5,3) = 2
      options: ['1', '2', '3', '4'],
      correctAnswer: 1,                  // 2 eşleşme = "2" şıkkı (index 1)
      points: 20,
      category: 'B',
      difficulty: 'orta'
    },

    {
      id: 22,
      question: '<strong>R</strong> harfi listede var mıydı?',
      stimType: 'sternberg',
      stimDur: 15000,
      taskHint: 'Çıkan harfleri sırayla ezberleyin.',
      taskReminder: 'Görev: Sonda bir harfin listede olup olmadığı sorulacak',
      encItems: ['G', 'R', 'T', 'B'],
      encDur: 2500,
      retDur: 1500,
      probeItem: 'R',
      options: ['Evet', 'Hayır'],
      correctAnswer: 0,
      points: 20,
      category: 'B',
      difficulty: 'orta'
    },

    {
      id: 24,
      question: '<strong>Mavi</strong> dizinin kaçıncı elemanıydı?',
      stimType: 'sequence',
      stimDur: 6000,
      stimItemDur: 1500,
      stimItemGap: 300,
      retentionDur: 1500,
      taskHint: 'Çıkan renkleri sırayla ezberleyin.',
      taskReminder: 'Görev: Sonda bir rengin pozisyonu sorulacak',
      items: ['Kırmızı', 'Mavi', 'Yeşil'],
      options: ['1', '2', '3', '4'],
      correctAnswer: 1,
      points: 20,
      category: 'B',
      difficulty: 'orta'
    },

    {
      id: 27,
      question: 'Bu üç rakamın <strong>toplamı</strong> kaçtır?',
      stimType: 'sequence',
      stimDur: 6000,
      stimItemDur: 1500,
      stimItemGap: 300,
      retentionDur: 1500,
      taskHint: 'Çıkan rakamları ezberleyin.',
      taskReminder: 'Görev: Sonda rakamların toplamı sorulacak',
      items: ['4', '9', '2'],
      options: ['13', '14', '15', '16'],
      correctAnswer: 2,
      points: 20,
      category: 'B',
      difficulty: 'orta'
    },

    {
      id: 29,
      question: '<strong>P</strong> harfi listede var mıydı?',
      stimType: 'sternberg',
      stimDur: 9000,
      taskHint: 'Çıkan harfleri sırayla ezberleyin.',
      taskReminder: 'Görev: Sonda bir harfin listede olup olmadığı sorulacak',
      encItems: ['M', 'X', 'P', 'L', 'K'],
      encDur: 3000,
      retDur: 2000,
      probeItem: 'P',
      options: ['Evet', 'Hayır'],
      correctAnswer: 0,
      points: 20,
      category: 'B',
      difficulty: 'orta'
    }
  ],

  // ==========================================================================
  // ZOR — Yüksek bilişsel yük
  // ==========================================================================
  zor: [

    // ── Uzamsal ──────────────────────────────────────────────────────────────
    {
      id: 9,
      question: '<strong>3×3×3 boyutundaki bir büyük küp</strong>, her yüzeyi farklı renkte boyanmıştır (6 yüz = 6 farklı renk). Küp <strong>1×1×1\'lik küçük parçalara</strong> ayrılıyor. Tam olarak <strong>3 farklı renkle boyalı</strong> kaç küçük küp vardır?',
      gorsel: {
        tip: 'html',
        icerik: `
          <div style="display:flex;gap:24px;align-items:center;flex-wrap:wrap;justify-content:center;">
            <svg width="120" height="120" viewBox="0 0 120 120">
              <polygon points="10,60 60,30 110,60 60,90" fill="#a0c4ff" stroke="#333" stroke-width="1.5"/>
              <polygon points="60,5 110,30 60,55 10,30" fill="#caffbf" stroke="#333" stroke-width="1.5"/>
              <polygon points="110,30 110,80 60,105 60,55" fill="#ffd6a5" stroke="#333" stroke-width="1.5"/>
              <line x1="27" y1="50" x2="77" y2="80" stroke="#333" stroke-width="0.8"/>
              <line x1="43" y1="40" x2="93" y2="70" stroke="#333" stroke-width="0.8"/>
              <line x1="27" y1="70" x2="77" y2="40" stroke="#333" stroke-width="0.8"/>
              <line x1="43" y1="80" x2="93" y2="50" stroke="#333" stroke-width="0.8"/>
            </svg>
            <div style="font-size:0.9rem;line-height:1.8;color:#ccc;">
              <div><span style="display:inline-block;width:14px;height:14px;background:#ff6b6b;border-radius:2px;vertical-align:middle;margin-right:6px;"></span><strong>Köşe küpleri:</strong> 3 renkle boyalı</div>
              <div><span style="display:inline-block;width:14px;height:14px;background:#ffd93d;border-radius:2px;vertical-align:middle;margin-right:6px;"></span>Kenar küpleri: 2 renkle boyalı — 12 adet</div>
              <div><span style="display:inline-block;width:14px;height:14px;background:#6bcb77;border-radius:2px;vertical-align:middle;margin-right:6px;"></span>Yüzey küpleri: 1 renkle boyalı — 6 adet</div>
              <div><span style="display:inline-block;width:14px;height:14px;background:#555;border-radius:2px;vertical-align:middle;margin-right:6px;"></span>Merkez küp: 0 renkle boyalı — 1 adet</div>
            </div>
          </div>`
      },
      options: ['4', '8', '12', '6'],
      correctAnswer: 1,
      points: 30,
      category: 'U',
      difficulty: 'zor'
    },

    {
      id: 10,
      question: `Bir şekil dizisi <strong>iki bağımsız kurala</strong> göre ilerliyor:<br>
        <strong>Kural 1:</strong> Daire her adımda ızgaranın içinde <em>bir satır yukarı çıkar</em> (5. satırdan başlar → 4 → 3 → ...).<br>
        <strong>Kural 2:</strong> <em>Çizgi sayısı</em> her adımda bir artar (Adım 1'de 1 çizgi → 2 → 3 → ...).<br>
        <strong>Adım 4'te ne olmalıdır?</strong>`,
      gorsel: {
        tip: 'html',
        icerik: `
          <div style="display:flex;flex-direction:column;gap:16px;align-items:center;">
            <div class="visual-row" style="gap:20px;justify-content:center;">
              <!-- Adım 1 -->
              <div class="visual-box">
                <span class="visual-label">Adım 1</span>
                <svg width="56" height="110" viewBox="0 0 56 110">
                  <rect x="8" y="5" width="40" height="18" fill="none" stroke="#444" stroke-width="1"/>
                  <rect x="8" y="25" width="40" height="18" fill="none" stroke="#444" stroke-width="1"/>
                  <rect x="8" y="45" width="40" height="18" fill="none" stroke="#444" stroke-width="1"/>
                  <rect x="8" y="65" width="40" height="18" fill="none" stroke="#444" stroke-width="1"/>
                  <rect x="8" y="85" width="40" height="18" fill="none" stroke="#444" stroke-width="1"/>
                  <circle cx="28" cy="94" r="7" fill="#6c63ff"/>
                  <line x1="8" y1="102" x2="48" y2="102" stroke="#aaa" stroke-width="1.5"/>
                </svg>
              </div>
              <span style="font-size:1.2rem;align-self:center;">→</span>
              <!-- Adım 2 -->
              <div class="visual-box">
                <span class="visual-label">Adım 2</span>
                <svg width="56" height="110" viewBox="0 0 56 110">
                  <rect x="8" y="5" width="40" height="18" fill="none" stroke="#444" stroke-width="1"/>
                  <rect x="8" y="25" width="40" height="18" fill="none" stroke="#444" stroke-width="1"/>
                  <rect x="8" y="45" width="40" height="18" fill="none" stroke="#444" stroke-width="1"/>
                  <rect x="8" y="65" width="40" height="18" fill="none" stroke="#444" stroke-width="1"/>
                  <rect x="8" y="85" width="40" height="18" fill="none" stroke="#444" stroke-width="1"/>
                  <circle cx="28" cy="74" r="7" fill="#6c63ff"/>
                  <line x1="8" y1="102" x2="48" y2="102" stroke="#aaa" stroke-width="1.5"/>
                  <line x1="8" y1="96" x2="48" y2="96" stroke="#aaa" stroke-width="1.5"/>
                </svg>
              </div>
              <span style="font-size:1.2rem;align-self:center;">→</span>
              <!-- Adım 3 -->
              <div class="visual-box">
                <span class="visual-label">Adım 3</span>
                <svg width="56" height="110" viewBox="0 0 56 110">
                  <rect x="8" y="5" width="40" height="18" fill="none" stroke="#444" stroke-width="1"/>
                  <rect x="8" y="25" width="40" height="18" fill="none" stroke="#444" stroke-width="1"/>
                  <rect x="8" y="45" width="40" height="18" fill="none" stroke="#444" stroke-width="1"/>
                  <rect x="8" y="65" width="40" height="18" fill="none" stroke="#444" stroke-width="1"/>
                  <rect x="8" y="85" width="40" height="18" fill="none" stroke="#444" stroke-width="1"/>
                  <circle cx="28" cy="54" r="7" fill="#6c63ff"/>
                  <line x1="8" y1="102" x2="48" y2="102" stroke="#aaa" stroke-width="1.5"/>
                  <line x1="8" y1="96" x2="48" y2="96" stroke="#aaa" stroke-width="1.5"/>
                  <line x1="8" y1="90" x2="48" y2="90" stroke="#aaa" stroke-width="1.5"/>
                </svg>
              </div>
              <span style="font-size:1.2rem;align-self:center;">→</span>
              <div class="visual-box">
                <span class="visual-label">Adım 4 = ?</span>
                <div class="question-mark-box">?</div>
              </div>
            </div>
            <div class="options-grid-visual">
              <!-- Seçenek A: Daire üst kısımda (satır 1), 4 çizgi -->
              <div class="visual-option" data-harf="A">
                <span class="visual-label">A</span>
                <svg width="56" height="110" viewBox="0 0 56 110">
                  <rect x="8" y="5" width="40" height="18" fill="none" stroke="#444" stroke-width="1"/>
                  <rect x="8" y="25" width="40" height="18" fill="none" stroke="#444" stroke-width="1"/>
                  <rect x="8" y="45" width="40" height="18" fill="none" stroke="#444" stroke-width="1"/>
                  <rect x="8" y="65" width="40" height="18" fill="none" stroke="#444" stroke-width="1"/>
                  <rect x="8" y="85" width="40" height="18" fill="none" stroke="#444" stroke-width="1"/>
                  <circle cx="28" cy="14" r="7" fill="#6c63ff"/>
                  <line x1="8" y1="102" x2="48" y2="102" stroke="#aaa" stroke-width="1.5"/>
                  <line x1="8" y1="96" x2="48" y2="96" stroke="#aaa" stroke-width="1.5"/>
                  <line x1="8" y1="90" x2="48" y2="90" stroke="#aaa" stroke-width="1.5"/>
                  <line x1="8" y1="84" x2="48" y2="84" stroke="#aaa" stroke-width="1.5"/>
                </svg>
              </div>
              <!-- Seçenek B: Daire satır 2, 4 çizgi (DOĞRU) -->
              <div class="visual-option" data-harf="B">
                <span class="visual-label">B</span>
                <svg width="56" height="110" viewBox="0 0 56 110">
                  <rect x="8" y="5" width="40" height="18" fill="none" stroke="#444" stroke-width="1"/>
                  <rect x="8" y="25" width="40" height="18" fill="none" stroke="#444" stroke-width="1"/>
                  <rect x="8" y="45" width="40" height="18" fill="none" stroke="#444" stroke-width="1"/>
                  <rect x="8" y="65" width="40" height="18" fill="none" stroke="#444" stroke-width="1"/>
                  <rect x="8" y="85" width="40" height="18" fill="none" stroke="#444" stroke-width="1"/>
                  <circle cx="28" cy="34" r="7" fill="#6c63ff"/>
                  <line x1="8" y1="102" x2="48" y2="102" stroke="#aaa" stroke-width="1.5"/>
                  <line x1="8" y1="96" x2="48" y2="96" stroke="#aaa" stroke-width="1.5"/>
                  <line x1="8" y1="90" x2="48" y2="90" stroke="#aaa" stroke-width="1.5"/>
                  <line x1="8" y1="84" x2="48" y2="84" stroke="#aaa" stroke-width="1.5"/>
                </svg>
              </div>
              <!-- Seçenek C: Daire satır 5 (geriye gitti), 4 çizgi -->
              <div class="visual-option" data-harf="C">
                <span class="visual-label">C</span>
                <svg width="56" height="110" viewBox="0 0 56 110">
                  <rect x="8" y="5" width="40" height="18" fill="none" stroke="#444" stroke-width="1"/>
                  <rect x="8" y="25" width="40" height="18" fill="none" stroke="#444" stroke-width="1"/>
                  <rect x="8" y="45" width="40" height="18" fill="none" stroke="#444" stroke-width="1"/>
                  <rect x="8" y="65" width="40" height="18" fill="none" stroke="#444" stroke-width="1"/>
                  <rect x="8" y="85" width="40" height="18" fill="none" stroke="#444" stroke-width="1"/>
                  <circle cx="28" cy="94" r="7" fill="#6c63ff"/>
                  <line x1="8" y1="102" x2="48" y2="102" stroke="#aaa" stroke-width="1.5"/>
                  <line x1="8" y1="96" x2="48" y2="96" stroke="#aaa" stroke-width="1.5"/>
                  <line x1="8" y1="90" x2="48" y2="90" stroke="#aaa" stroke-width="1.5"/>
                  <line x1="8" y1="84" x2="48" y2="84" stroke="#aaa" stroke-width="1.5"/>
                </svg>
              </div>
              <!-- Seçenek D: Daire satır 2, 5 çizgi (çok fazla) -->
              <div class="visual-option" data-harf="D">
                <span class="visual-label">D</span>
                <svg width="56" height="110" viewBox="0 0 56 110">
                  <rect x="8" y="5" width="40" height="18" fill="none" stroke="#444" stroke-width="1"/>
                  <rect x="8" y="25" width="40" height="18" fill="none" stroke="#444" stroke-width="1"/>
                  <rect x="8" y="45" width="40" height="18" fill="none" stroke="#444" stroke-width="1"/>
                  <rect x="8" y="65" width="40" height="18" fill="none" stroke="#444" stroke-width="1"/>
                  <rect x="8" y="85" width="40" height="18" fill="none" stroke="#444" stroke-width="1"/>
                  <circle cx="28" cy="34" r="7" fill="#6c63ff"/>
                  <line x1="8" y1="102" x2="48" y2="102" stroke="#aaa" stroke-width="1.5"/>
                  <line x1="8" y1="96" x2="48" y2="96" stroke="#aaa" stroke-width="1.5"/>
                  <line x1="8" y1="90" x2="48" y2="90" stroke="#aaa" stroke-width="1.5"/>
                  <line x1="8" y1="84" x2="48" y2="84" stroke="#aaa" stroke-width="1.5"/>
                  <line x1="8" y1="78" x2="48" y2="78" stroke="#aaa" stroke-width="1.5"/>
                </svg>
              </div>
            </div>
          </div>`
      },
      gorselSecenekler: true,
      options: ['Seçenek A', 'Seçenek B', 'Seçenek C', 'Seçenek D'],
      correctAnswer: 1,
      points: 30,
      category: 'U',
      difficulty: 'zor'
    },

    // ── Bellek — Yüksek ───────────────────────────────────────────────────────
    {
      id: 31,
      question: 'Bu dizide kaç tane 3 adım önceki ile aynı harf vardı?',
      stimType: 'nback',
      stimDur: 12000,                   // 6 harf × ~2sn
      stimItemDur: 1500,                // ⚡ Owen vd. standart
      stimItemGap: 300,                 // ⚡ ISI
      retentionDur: 2000,
      n_val: 3,
      taskReminder: 'Görev: 3 adım önceki ile aynı harfi zihinde sayın',
      // 3-back analiz: B(0), K(1), T(2), M(3), K(4), T(5)
      //   M(3) vs B(0): farklı
      //   K(4) vs K(1): EVET ✓
      //   T(5) vs T(2): EVET ✓
      // Toplam: 2 eşleşme
      items: ['B', 'K', 'T', 'M', 'K', 'T'],
      options: ['0', '1', '2', '3'],
      correctAnswer: 2,                  // 2 eşleşme = "2" şıkkı (index 2)
      points: 30,
      category: 'B',
      difficulty: 'zor'
    },

    {
      id: 32,
      question: '"<strong>M</strong>" harfi listede var mıydı?',
      stimType: 'sternberg',
      stimDur: 9000,
      taskHint: 'Çıkan harfleri sırayla ezberleyin.',
      taskReminder: 'Görev: Sonda bir harfin listede olup olmadığı sorulacak',
      encItems: ['G', 'R', 'T', 'B', 'N', 'S'],
      encDur: 4000,
      retDur: 2000,
      probeItem: 'M',
      options: ['Evet', 'Hayır'],
      correctAnswer: 1,
      points: 30,
      category: 'B',
      difficulty: 'zor'
    },

    {
      id: 34,
      question: '<strong>Son liste nedir?</strong><br>Kural: Harf gelince <strong>ekle</strong>, tekrar gelince <strong>çıkar</strong>.',
      stimType: 'sequence',
      stimDur: 10000,                   // 5 harf × ~2sn
      stimItemDur: 1500,                // ⚡ Owen vd. standart
      stimItemGap: 300,                 // ⚡ ISI
      retentionDur: 2000,
      taskHint: '<strong>Kural:</strong> Harf gelince listeye ekle. Aynı harf tekrar gelince listeden çıkar.',
      taskReminder: 'Kural: Harf gelince EKLE • aynı harf tekrar gelince ÇIKAR. Sondaki listeyi seçin.',
      items: ['A', 'B', 'A', 'C', 'B'],
      // A → [A]
      // B → [A, B]
      // A (tekrar) → [B]
      // C → [B, C]
      // B (tekrar) → [C]
      // Final: [C]
      options: ['A', 'B', 'C', 'A,C'],
      correctAnswer: 2,                  // "C" şıkkı
      points: 30,
      category: 'B',
      difficulty: 'zor'
    },

    {
      id: 36,
      question: '"<strong>Y</strong>" harfi listede var mıydı?',
      stimType: 'sternberg',
      stimDur: 9000,
      taskHint: 'Çıkan harfleri sırayla ezberleyin.',
      taskReminder: 'Görev: Sonda bir harfin listede olup olmadığı sorulacak',
      encItems: ['Q', 'W', 'E', 'R', 'T', 'Y', 'U'],
      encDur: 5000,
      retDur: 3000,
      probeItem: 'Y',
      options: ['Evet', 'Hayır'],
      correctAnswer: 0,
      points: 30,
      category: 'B',
      difficulty: 'zor'
    },

    {
      id: 39,
      question: 'Ezberlediğin <span style="color:#ff5252">kırmızı</span> kelimeleri seçin',
      stimType: 'sequence',
      stimDur: 6000,                    // 3 öğe × 2sn
      stimItemDur: 1800,                // ⚡ Biraz daha uzun (3 öğe)
      stimItemGap: 200,                 // ⚡ Kısa boşluk
      retentionDur: 1500,
      taskHint: '<strong style="color:#ff5252">Kırmızı</strong> kelimeleri ezberle. <strong style="color:#5ba3ff">Mavi</strong> dikkat dağıtıcıdır.',
      taskReminder: 'Sadece <span style="color:#ff5252">KIRMIZI</span> kelimeleri ezberleyin.',
      items: ['Köpek', '4×3=?', 'Ayak'],
      colors: ['#ff5252', '#5ba3ff', '#ff5252'],
      options: ['Köpek', 'Ayak', 'Köpek, Ayak', 'Köpek, 4×3=?, Ayak'],
      correctAnswer: 2,
      points: 30,
      category: 'B',
      difficulty: 'zor'
    }
  ]
};

// ============================================================================
// SÜRE AYARLARI (saniye) — stimDur + cevap süresi dahil
// ----------------------------------------------------------------------------
// Owen vd. (2005) standardına göre güncellendi:
//   - Her uyaran 1500ms
//   - ISI (uyaranlar arası) 300ms
//   - Retention (bekleme) 1500-2000ms
//   - Cevap için ek 8-15sn süre
// ============================================================================
export const timeByDifficulty = {
  kolay: 40,    // ⚡ 30 → 40 (bellek görevleri için biraz daha)
  orta:  75,    // ⚡ 60 → 75 (orta n-back daha uzun)
  zor:   150    // ⚡ 120 → 150 (3-back ve sternberg uzun)
};

// ============================================================================
// PROTOKOL AYARLARI (EEG)
// ============================================================================
export const protocolConfig = {
  baselineDuration:  180,   // 3 dk dinlenme/baseline
  interBlockRest:     60,   // bloklar arası dinlenme (sn)
  interTrialInterval: 1500, // sorular arası fixation cross (ms)
  fixationDuration:   500,  // soru öncesi fixation cross (ms)
  nasaTlxTimeout:     120,  // NASA-TLX maks. süre (sn)
  
  // ⚡ YENİ: Owen vd. (2005) standart değerleri (default)
  defaultStimItemDur: 1500, // Her uyaran 1500ms
  defaultStimItemGap:  300, // Inter-stimulus interval
  defaultRetention:   1500  // Retention (bekleme) süresi
};

export const difficultyOrder = ['kolay', 'orta', 'zor'];

export const categoryInfo = {
  U: { name: 'Uzamsal-Görsel', cognitive: 'Zihinsel döndürme, şekil analizi, örüntü tanıma' },
  B: { name: 'Bellek',         cognitive: 'Kısa süreli bellek, n-back, Sternberg, sıra hatırlama' }
};