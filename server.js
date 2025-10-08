require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { PrismaClient } = require('@prisma/client');
const financialRoutes = require('./routes/financial');
const syncService = require('./services/syncService');
const apiService = require('./services/apiService');

const app = express();
const PORT = process.env.PORT || 5000;
const prisma = new PrismaClient();

// Middleware
app.use(cors());
app.use(express.json());

// Routes
app.use('/api/financial', financialRoutes);

// Debug endpoint'leri
app.get('/api/debug/db', async (req, res) => {
  try {
    const count = await prisma.financialData.count();
    const allData = await prisma.financialData.findMany({
      take: 10
    });
    
    res.json({
      databaseConnection: 'OK',
      totalRecords: count,
      sampleRecords: allData,
      connectionUrl: process.env.DATABASE_URL ? 'SET' : 'MISSING'
    });
  } catch (error) {
    res.status(500).json({ 
      databaseConnection: 'ERROR',
      error: error.message 
    });
  }
});

// Manuel senkronizasyon endpoint'i
app.post('/api/debug/sync', async (req, res) => {
  try {
    console.log('=== MANUEL SENKRONİZASYON BAŞLATILDI ===');
    await syncService.syncData();
    
    const count = await prisma.financialData.count();
    res.json({ 
      message: 'Manuel senkronizasyon tamamlandı',
      totalRecords: count
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// API test endpoint'i
app.get('/api/debug/test-api', async (req, res) => {
  try {
    console.log('=== API TEST BAŞLATILDI ===');
    const token = await apiService.getToken();
    const rawData = await apiService.getData(token);
    
    res.json({
      tokenReceived: !!token,
      rawDataLength: rawData.length,
      rawDataSample: rawData.substring(0, 500),
      message: 'API test tamamlandı'
    });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Health check
app.get('/health', (req, res) => {
  res.json({ status: 'OK', timestamp: new Date().toISOString() });
});

// Sync service'ı başlat
console.log('Sync servisi başlatılıyor...');
process.env.NODE_TLS_REJECT_UNAUTHORIZED = '0';

app.listen(PORT, () => {
  console.log(`🚀 Backend server ${PORT} portunda çalışıyor`);
  console.log(`🔍 Health check: http://192.168.3.111:${PORT}/health`);
  console.log(`📊 API endpoint: http://192.168.3.111:${PORT}/api/financial/data`);
  console.log(`🐛 Debug DB: http://192.168.3.111:${PORT}/api/debug/db`);
  console.log(`🔧 Manuel Sync: http://192.168.3.111:${PORT}/api/debug/sync (POST)`);
  console.log(`🧪 API Test: http://192.168.3.111:${PORT}/api/debug/test-api`);
});