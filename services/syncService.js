const { PrismaClient } = require('@prisma/client');
const apiService = require('./apiService');
const cron = require('node-cron');

const prisma = new PrismaClient();

class SyncService {
  constructor() {
    // Başlangıçta bir kere senkronizasyon yap
    this.syncData();
    
    // Her 5 dakikada bir senkronizasyon
    cron.schedule('*/5 * * * *', () => {
      console.log('Zamanlı senkronizasyon başlatılıyor...');
      this.syncData();
    });
  }

  async syncData() {
    try {
      console.log('=== VERİ SENKRONİZASYONU BAŞLATILIYOR ===');
      const token = await apiService.getToken();
      const rawData = await apiService.getData(token);
      
      let data;
      try {
        data = JSON.parse(rawData);
        console.log('✅ JSON parse başarılı');
        console.log(`📊 Toplam ${data.length} kayıt bulundu`);
      } catch (parseError) {
        console.log('❌ JSON parse hatası:', parseError.message);
        return;
      }
      
      // Verileri işle ve veritabanına kaydet
      if (Array.isArray(data) && data.length > 0) {
        console.log('🗃️ Veritabanına kayıt başlatılıyor...');
        await this.processAndSaveData(data);
        console.log('✅ Veri senkronizasyonu tamamlandı:', new Date().toLocaleString('tr-TR'));
      }
      
    } catch (error) {
      console.error('❌ Senkronizasyon hatası:', error.message);
    }
  }

  async processAndSaveData(data) {
    let savedCount = 0;
    let errorCount = 0;

    console.log(`🔄 ${data.length} kayıt işleniyor...`);

    // Tüm seviye kayıtlarını topla
    const allLevels = [];

    for (let i = 0; i < data.length; i++) {
      const item = data[i];
      
      try {
        // Kırılım seviyelerini belirle
        const levels = this.calculateLevels(item);
        
        if (levels.length === 0) {
          continue;
        }

        // Tüm seviyeleri toplu array'e ekle
        allLevels.push(...levels);

        // İlerlemeyi göster
        if ((i + 1) % 50 === 0) {
          console.log(`📈 ${i + 1}/${data.length} kayıt işlendi...`);
        }
      } catch (itemError) {
        console.error(`❌ Öğe ${i + 1} işleme hatası:`, itemError.message);
        errorCount++;
      }
    }

    console.log(`📊 Toplam ${allLevels.length} seviye kaydı oluşturulacak`);

    // Benzersiz kayıtları bul (code + level kombinasyonuna göre)
    const uniqueLevels = this.getUniqueLevels(allLevels);
    console.log(`🔍 ${uniqueLevels.length} benzersiz kayıt bulundu`);

    // Toplu UPSERT işlemi
    for (const levelData of uniqueLevels) {
      try {
        await this.upsertFinancialData(levelData);
        savedCount++;
      } catch (upsertError) {
        console.error(`❌ UPSERT hatası [${levelData.code} - Seviye ${levelData.level}]:`, upsertError.message);
        errorCount++;
      }
    }

    console.log(`🎉 İşlem tamamlandı: ${savedCount} kayıt başarılı, ${errorCount} hata`);
    
    // Son durumu kontrol et
    const totalInDb = await prisma.financialData.count();
    console.log(`📊 Veritabanındaki toplam kayıt: ${totalInDb}`);
  }

  // Benzersiz kayıtları bul (code + level kombinasyonuna göre)
  getUniqueLevels(levels) {
    const uniqueMap = new Map();
    
    levels.forEach(level => {
      const key = `${level.code}-${level.level}`;
      if (!uniqueMap.has(key)) {
        uniqueMap.set(key, level);
      }
    });
    
    return Array.from(uniqueMap.values());
  }

  // services/syncService.js - calculateLevels fonksiyonunu değiştirin
calculateLevels(item) {
  const levels = [];
  const code = item.hesap_kodu;
  const name = item.hesap_adi;
  const debt = item.borc;
  const credit = item.alacak;

  if (!code) return levels;

  // Kodu temizle ve noktasız versiyonunu al
  const cleanCode = code.toString().trim();
  const codeWithoutDots = cleanCode.replace(/\./g, '');
  
  if (codeWithoutDots.length < 3) {
    return levels;
  }

  // Seviye 1: İlk 3 hane (noktasız)
  const level1Code = codeWithoutDots.substring(0, 3);
  levels.push({
    code: level1Code, // "120" formatında
    name: `${level1Code} - Ana Grup`,
    debt: this.parseNumber(debt),
    credit: this.parseNumber(credit),
    level: 1
  });

  // Seviye 2: İlk 5 hane (noktalı format: "120.01")
  if (codeWithoutDots.length >= 5) {
    const level2CodeNumeric = codeWithoutDots.substring(0, 5);
    const level2CodeFormatted = `${codeWithoutDots.substring(0, 3)}.${codeWithoutDots.substring(3, 5)}`;
    
    levels.push({
      code: level2CodeFormatted, // "120.01" formatında
      name: `${level2CodeFormatted} - Alt Grup`,
      debt: this.parseNumber(debt),
      credit: this.parseNumber(credit),
      level: 2
    });
  }

  // Seviye 3: Orijinal kod (noktalı format)
  levels.push({
    code: cleanCode, // "120.01.001" formatında
    name: name,
    debt: this.parseNumber(debt),
    credit: this.parseNumber(credit),
    level: 3
  });

  return levels;
}

  parseNumber(value) {
    if (value === null || value === undefined) return 0;
    const num = parseFloat(value);
    return isNaN(num) ? 0 : num;
  }

  async upsertFinancialData(data) {
    try {
      await prisma.financialData.upsert({
        where: {
          code_level: {
            code: data.code,
            level: data.level
          }
        },
        update: {
          name: data.name,
          debt: data.debt,
          credit: data.credit,
          updatedAt: new Date()
        },
        create: {
          code: data.code,
          name: data.name,
          debt: data.debt,
          credit: data.credit,
          level: data.level
        }
      });
    } catch (error) {
      console.error(`❌ UPSERT hatası [${data.code} - Seviye ${data.level}]:`, error.message);
      throw error;
    }
  }

  // Manuel senkronizasyon için
  async manualSync() {
    return await this.syncData();
  }
}

module.exports = new SyncService();