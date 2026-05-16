// ============================================================================
// Bilişsel Yük Odaklı Soru Veritabanı (v2.0)
// EEG + NASA-TLX Çalışması için Derecelendirilmiş Set
// ----------------------------------------------------------------------------
// Kategoriler:
//   A - Aritmetik İşlem (basamak/işlem sayısı ile derecelendirilir)
//   B - Kategorik Karar (çeldirici yakınlığı ile derecelendirilir)
//   C - Cebirsel Akıl Yürütme (değişken/işlem sayısı ile derecelendirilir)
//   D - Çalışma Belleği (item sayısı + manipülasyon ile derecelendirilir)
//
// Her zorluk seviyesinde: 4 kategori × 3 soru = 12 soru
// ============================================================================

export const questions = {
  // ==========================================================================
  // KOLAY SEVİYE — Düşük bilişsel yük (baseline'a yakın)
  // Hedef: Otomatik işlem, minimal çalışma belleği yükü
  // ==========================================================================
  kolay: [
    // --- Kategori A: Tek basamaklı aritmetik ---
    {
      id: 1,
      question: "6 + 3 = ?",
      options: ["7", "8", "9", "10"],
      correctAnswer: 2,
      points: 10,
      category: "A",
      difficulty: "kolay"
    },
    {
      id: 2,
      question: "9 + 4 = ?",
      options: ["11", "12", "13", "14"],
      correctAnswer: 2,
      points: 10,
      category: "A",
      difficulty: "kolay"
    },
    {
      id: 3,
      question: "8 − 5 = ?",
      options: ["2", "3", "4", "5"],
      correctAnswer: 1,
      points: 10,
      category: "A",
      difficulty: "kolay"
    },

    // --- Kategori B: Uzak çeldirici (anlamsal mesafe yüksek) ---
    {
      id: 4,
      question: "Kalem – Defter – Kitap – Muz\nHangisi farklıdır?",
      options: ["Kalem", "Defter", "Kitap", "Muz"],
      correctAnswer: 3,
      points: 10,
      category: "B",
      difficulty: "kolay"
    },
    {
      id: 5,
      question: "Elma – Armut – Çilek – Masa\nHangisi farklıdır?",
      options: ["Elma", "Armut", "Çilek", "Masa"],
      correctAnswer: 3,
      points: 10,
      category: "B",
      difficulty: "kolay"
    },
    {
      id: 6,
      question: "Köpek – Kedi – Tavşan – Araba\nHangisi farklıdır?",
      options: ["Köpek", "Kedi", "Tavşan", "Araba"],
      correctAnswer: 3,
      points: 10,
      category: "B",
      difficulty: "kolay"
    },

    // --- Kategori C: Tek adımlı cebir ---
    {
      id: 7,
      question: "X + 3 = 7 ise X = ?",
      options: ["2", "3", "4", "5"],
      correctAnswer: 2,
      points: 10,
      category: "C",
      difficulty: "kolay"
    },
    {
      id: 8,
      question: "X − 2 = 5 ise X = ?",
      options: ["5", "6", "7", "8"],
      correctAnswer: 2,
      points: 10,
      category: "C",
      difficulty: "kolay"
    },
    {
      id: 9,
      question: "2X = 8 ise X = ?",
      options: ["2", "3", "4", "5"],
      correctAnswer: 2,
      points: 10,
      category: "C",
      difficulty: "kolay"
    },

    // --- Kategori D: 3 item forward span (sıralı hatırlama) ---
    {
      id: 10,
      question: "Sayılar: 4 – 7 – 2\nAynı sırayla seçiniz.",
      options: ["4 – 7 – 2", "2 – 7 – 4", "7 – 4 – 2", "4 – 2 – 7"],
      correctAnswer: 0,
      points: 10,
      category: "D",
      difficulty: "kolay"
    },
    {
      id: 11,
      question: "Sayılar: 5 – 1 – 8\nAynı sırayla seçiniz.",
      options: ["1 – 5 – 8", "5 – 1 – 8", "8 – 1 – 5", "5 – 8 – 1"],
      correctAnswer: 1,
      points: 10,
      category: "D",
      difficulty: "kolay"
    },
    {
      id: 12,
      question: "Sayılar: 3 – 9 – 6\nAynı sırayla seçiniz.",
      options: ["6 – 9 – 3", "3 – 6 – 9", "3 – 9 – 6", "9 – 3 – 6"],
      correctAnswer: 2,
      points: 10,
      category: "D",
      difficulty: "kolay"
    }
  ],

  // ==========================================================================
  // ORTA SEVİYE — Orta bilişsel yük
  // Hedef: Aktif çalışma belleği kullanımı, ödünç alma/verme gerektiren işlem
  // ==========================================================================
  orta: [
    // --- Kategori A: İki basamaklı, ödünç alma gerektiren ---
    {
      id: 13,
      question: "52 − 27 = ?",
      options: ["23", "24", "25", "26"],
      correctAnswer: 2,
      points: 20,
      category: "A",
      difficulty: "orta"
    },
    {
      id: 14,
      question: "38 + 47 = ?",
      options: ["83", "84", "85", "86"],
      correctAnswer: 2,
      points: 20,
      category: "A",
      difficulty: "orta"
    },
    {
      id: 15,
      question: "73 − 46 = ?",
      options: ["25", "26", "27", "28"],
      correctAnswer: 2,
      points: 20,
      category: "A",
      difficulty: "orta"
    },

    // --- Kategori B: Yakın çeldirici (aynı süperkategori) ---
    {
      id: 16,
      question: "Kedi – Köpek – Aslan – Tavşan\nHangisi evcil hayvan değildir?",
      options: ["Kedi", "Köpek", "Aslan", "Tavşan"],
      correctAnswer: 2,
      points: 20,
      category: "B",
      difficulty: "orta"
    },
    {
      id: 17,
      question: "Elma – Armut – Domates – Şeftali\nHangisi meyve değildir?",
      options: ["Elma", "Armut", "Domates", "Şeftali"],
      correctAnswer: 2,
      points: 20,
      category: "B",
      difficulty: "orta"
    },
    {
      id: 18,
      question: "Keman – Gitar – Flüt – Piyano\nHangisi yaylı çalgı değildir?",
      options: ["Keman", "Gitar", "Flüt", "Piyano"],
      correctAnswer: 0,
      points: 20,
      category: "B",
      difficulty: "orta"
    },

    // --- Kategori C: İki adımlı cebir ---
    {
      id: 19,
      question: "2X − 6 = 10 ise X = ?",
      options: ["6", "7", "8", "9"],
      correctAnswer: 2,
      points: 20,
      category: "C",
      difficulty: "orta"
    },
    {
      id: 20,
      question: "3X + 4 = 19 ise X = ?",
      options: ["3", "4", "5", "6"],
      correctAnswer: 2,
      points: 20,
      category: "C",
      difficulty: "orta"
    },
    {
      id: 21,
      question: "(X / 2) + 3 = 8 ise X = ?",
      options: ["8", "9", "10", "11"],
      correctAnswer: 2,
      points: 20,
      category: "C",
      difficulty: "orta"
    },

    // --- Kategori D: 5 item backward span (ters sıralı hatırlama) ---
    {
      id: 22,
      question: "Sayılar: 3 – 8 – 5 – 1 – 6\nTers sırayla seçiniz.",
      options: [
        "1 – 6 – 5 – 8 – 3",
        "3 – 8 – 5 – 1 – 6",
        "6 – 5 – 1 – 8 – 3",
        "6 – 1 – 5 – 8 – 3"
      ],
      correctAnswer: 3,
      points: 20,
      category: "D",
      difficulty: "orta"
    },
    {
      id: 23,
      question: "Sayılar: 2 – 7 – 4 – 9 – 1\nTers sırayla seçiniz.",
      options: [
        "1 – 9 – 4 – 7 – 2",
        "2 – 7 – 4 – 9 – 1",
        "9 – 4 – 1 – 7 – 2",
        "1 – 4 – 9 – 7 – 2"
      ],
      correctAnswer: 0,
      points: 20,
      category: "D",
      difficulty: "orta"
    },
    {
      id: 24,
      question: "Sayılar: 6 – 3 – 8 – 2 – 5\nTers sırayla seçiniz.",
      options: [
        "6 – 3 – 8 – 2 – 5",
        "5 – 2 – 8 – 3 – 6",
        "2 – 5 – 8 – 6 – 3",
        "5 – 8 – 2 – 3 – 6"
      ],
      correctAnswer: 1,
      points: 20,
      category: "D",
      difficulty: "orta"
    }
  ],

  // ==========================================================================
  // ZOR SEVİYE — Yüksek bilişsel yük
  // Hedef: Çoklu işlem zinciri, soyut karar, dual-task çalışma belleği
  // ==========================================================================
  zor: [
    // --- Kategori A: Üç işlem zinciri / parantezli ---
    {
      id: 25,
      question: "(28 + 14) − (6 × 3) = ?",
      options: ["22", "24", "26", "28"],
      correctAnswer: 1,
      points: 30,
      category: "A",
      difficulty: "zor"
    },
    {
      id: 26,
      question: "45 + 17 − 9 × 2 = ?",
      options: ["42", "44", "46", "48"],
      correctAnswer: 1,
      points: 30,
      category: "A",
      difficulty: "zor"
    },
    {
      id: 27,
      question: "(36 / 4) + (7 × 3) − 5 = ?",
      options: ["23", "25", "27", "29"],
      correctAnswer: 1,
      points: 30,
      category: "A",
      difficulty: "zor"
    },

    // --- Kategori B: Soyut/çapraz kategori ---
    {
      id: 28,
      question: "Uçak – Arı – Yusufçuk – Kuş\nHangisi canlı değildir?",
      options: ["Uçak", "Arı", "Yusufçuk", "Kuş"],
      correctAnswer: 0,
      points: 30,
      category: "B",
      difficulty: "zor"
    },
    {
      id: 29,
      question: "Mutluluk – Kitap – Sevinç – Üzüntü\nHangisi somut bir kavramdır?",
      options: ["Mutluluk", "Kitap", "Sevinç", "Üzüntü"],
      correctAnswer: 1,
      points: 30,
      category: "B",
      difficulty: "zor"
    },
    {
      id: 30,
      question: "Adalet – Demir – Özgürlük – Cesaret\nHangisi soyut kavram değildir?",
      options: ["Adalet", "Demir", "Özgürlük", "Cesaret"],
      correctAnswer: 1,
      points: 30,
      category: "B",
      difficulty: "zor"
    },

    // --- Kategori C: İki değişkenli denklem sistemi ---
    {
      id: 31,
      question: "X + Y = 12 ve X − Y = 4 ise X = ?",
      options: ["6", "7", "8", "9"],
      correctAnswer: 2,
      points: 30,
      category: "C",
      difficulty: "zor"
    },
    {
      id: 32,
      question: "2X + Y = 15 ve X + Y = 9 ise X = ?",
      options: ["4", "5", "6", "7"],
      correctAnswer: 2,
      points: 30,
      category: "C",
      difficulty: "zor"
    },
    {
      id: 33,
      question: "3X − Y = 10 ve X + Y = 6 ise X = ?",
      options: ["3", "4", "5", "6"],
      correctAnswer: 1,
      points: 30,
      category: "C",
      difficulty: "zor"
    },

    // --- Kategori D: 6 item + manipülasyon (dual-task) ---
    {
      id: 34,
      question: "Sayılar: 4 – 7 – 2 – 8 – 5 – 3\nBu sayılardan ÇİFT olanları sırasıyla seçiniz.",
      options: [
        "4 – 2 – 8",
        "4 – 8 – 2",
        "2 – 4 – 8",
        "4 – 7 – 8"
      ],
      correctAnswer: 0,
      points: 30,
      category: "D",
      difficulty: "zor"
    },
    {
      id: 35,
      question: "Sayılar: 9 – 3 – 6 – 1 – 7 – 4\nBu sayılardan TEK olanları TERS sırayla seçiniz.",
      options: [
        "9 – 3 – 1 – 7",
        "7 – 1 – 3 – 9",
        "1 – 3 – 7 – 9",
        "9 – 7 – 3 – 1"
      ],
      correctAnswer: 1,
      points: 30,
      category: "D",
      difficulty: "zor"
    },
    {
      id: 36,
      question: "Sayılar: 5 – 2 – 8 – 3 – 6 – 1\nBu sayılardan 4'TEN BÜYÜK olanları küçükten büyüğe seçiniz.",
      options: [
        "5 – 6 – 8",
        "8 – 6 – 5",
        "5 – 8 – 6",
        "6 – 5 – 8"
      ],
      correctAnswer: 0,
      points: 30,
      category: "D",
      difficulty: "zor"
    }
  ]
};

// ============================================================================
// SÜRE AYARLARI (saniye)
// ----------------------------------------------------------------------------
// Her soru için MAKSİMUM süre. Katılımcı cevap verirse anında geçilir
// (self-paced design). Süre dolduğunda otomatik geçiş yapılır.
// ============================================================================
export const timeByDifficulty = {
  kolay: 20,   // 3-5 sn ortalama beklenir
  orta: 35,    // 10-20 sn ortalama beklenir
  zor: 60      // 25-45 sn ortalama beklenir
};

// ============================================================================
// BLOK AKIŞ AYARLARI
// ----------------------------------------------------------------------------
// EEG protokolü için zamanlama parametreleri
// ============================================================================
export const protocolConfig = {
  baselineDuration: 180,        // 3 dk dinlenme/baseline (saniye)
  interBlockRest: 60,           // Bloklar arası 1 dk dinlenme
  interTrialInterval: 1500,     // Sorular arası 1.5 sn fixation cross (ms)
  fixationDuration: 500,        // Soru öncesi fixation cross (ms)
  nasaTlxTimeout: 120           // NASA-TLX için maks. süre (saniye)
};

// Zorluk seviyesi sırası
export const difficultyOrder = ['kolay', 'orta', 'zor'];

// ============================================================================
// KATEGORİ AÇIKLAMALARI (analiz aşamasında kullanmak için)
// ============================================================================
export const categoryInfo = {
  A: { name: "Aritmetik İşlem", cognitive: "Sayısal işleme, mental hesaplama" },
  B: { name: "Kategorik Karar", cognitive: "Semantik bellek, kategorizasyon" },
  C: { name: "Cebirsel Akıl Yürütme", cognitive: "Soyut akıl yürütme, denklem çözme" },
  D: { name: "Çalışma Belleği", cognitive: "Bilgi tutma + manipülasyon" }
};