const express = require('express');
const { PrismaClient } = require('@prisma/client');
const router = express.Router();
const prisma = new PrismaClient();

// Hiyerarşik veri yapısı oluştur
// financialRoutes.js - buildHierarchicalData fonksiyonunda düzeltme
// routes/financial.js - buildHierarchicalData fonksiyonunu değiştirin
function buildHierarchicalData(data) {
  const level1Data = data.filter(item => item.level === 1);
  const level2Data = data.filter(item => item.level === 2);
  const level3Data = data.filter(item => item.level === 3);

  const result = [];

  // Seviye 1: Ana gruplar
  level1Data.forEach(level1Item => {
    const level1Code = level1Item.code; // "120" (noktasız)
    
    // Bu ana gruba ait seviye 2 kayıtlarını bul
    const relatedLevel2 = level2Data.filter(level2Item => {
      // "120.01" -> "120" ile başlıyor mu?
      return level2Item.code.startsWith(level1Code + '.');
    });

    const level1Entry = {
      code: level1Item.code,
      name: level1Item.name,
      debt: level1Item.debt,
      credit: level1Item.credit,
      level: 1,
      children: []
    };

    // Seviye 2: Alt gruplar
    relatedLevel2.forEach(level2Item => {
      const level2Code = level2Item.code; // "120.01"
      
      // Bu alt gruba ait seviye 3 kayıtlarını bul
      const relatedLevel3 = level3Data.filter(level3Item => {
        // "120.01.001" -> "120.01" ile başlıyor mu?
        return level3Item.code.startsWith(level2Code + '.');
      });

      const level2Entry = {
        code: level2Item.code,
        name: level2Item.name,
        debt: level2Item.debt,
        credit: level2Item.credit,
        level: 2,
        children: relatedLevel3.map(level3Item => ({
          code: level3Item.code,
          name: level3Item.name,
          debt: level3Item.debt,
          credit: level3Item.credit,
          level: 3,
          children: []
        }))
      };

      level1Entry.children.push(level2Entry);
    });

    result.push(level1Entry);
  });

  // Toplamları hesapla
  return calculateTotals(result);
}

// Toplamları hesapla (recursive)
function calculateTotals(data) {
  data.forEach(item => {
    if (item.children && item.children.length > 0) {
      // Önce çocukların toplamlarını hesapla
      calculateTotals(item.children);
      
      // Kendi toplamını çocukların toplamı olarak güncelle
      const childrenTotals = item.children.reduce((acc, child) => ({
        debt: acc.debt + (child.debt || 0),
        credit: acc.credit + (child.credit || 0)
      }), { debt: 0, credit: 0 });

      item.debt = childrenTotals.debt;
      item.credit = childrenTotals.credit;
    }
  });

  return data;
}

router.get('/data', async (req, res) => {
  try {
    console.log('Finansal veri isteği alındı');
    
    const data = await prisma.financialData.findMany({
      orderBy: [
        { level: 'asc' },
        { code: 'asc' }
      ]
    });
    
    console.log(`Veritabanından ${data.length} kayıt alındı`);
    
    // Hiyerarşik yapı oluştur ve toplamları hesapla
    const hierarchicalData = buildHierarchicalData(data);
    
    res.json(hierarchicalData);
  } catch (error) {
    console.error('Veri getirme hatası:', error);
    res.status(500).json({ error: error.message });
  }
});

// Debug endpoint'i
router.get('/debug/hierarchical', async (req, res) => {
  try {
    const data = await prisma.financialData.findMany({
      orderBy: [
        { level: 'asc' },
        { code: 'asc' }
      ]
    });
    
    const hierarchicalData = buildHierarchicalData(data);
    res.json({
      totalRecords: data.length,
      hierarchicalData: hierarchicalData
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Tüm verileri göster (debug için)
router.get('/debug', async (req, res) => {
  try {
    const allData = await prisma.financialData.findMany({
      orderBy: [
        { level: 'asc' },
        { code: 'asc' }
      ]
    });
    
    res.json({
      totalCount: allData.length,
      data: allData
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Veritabanını temizle (test için)
router.delete('/clear', async (req, res) => {
  try {
    const result = await prisma.financialData.deleteMany();
    res.json({ 
      message: 'Tüm veriler silindi',
      deletedCount: result.count 
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

module.exports = router;