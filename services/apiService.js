const axios = require('axios');
const https = require('https');

// SSL doğrulamasını devre dışı bırakan axios instance'ı oluştur
const axiosInstance = axios.create({
  httpsAgent: new https.Agent({  
    rejectUnauthorized: false // SSL sertifika doğrulamasını devre dışı bırak
  })
});

class ApiService {
  constructor() {
    this.baseURL = 'https://efatura.etrsoft.com/fmi/data/v1/databases/testdb';
    this.auth = {
      username: 'apitest',
      password: 'test123'
    };
  }

  async getToken() {
    try {
      console.log('Token alınıyor...');
      const response = await axiosInstance.post(`${this.baseURL}/sessions`, {}, {
        auth: this.auth,
        headers: { 'Content-Type': 'application/json' }
      });
      console.log('Token başarıyla alındı');
      return response.data.response.token;
    } catch (error) {
      console.error('Token alınamadı:', error.response?.data || error.message);
      throw new Error('Token alınamadı: ' + error.message);
    }
  }

  async getData(token) {
    try {
      console.log('Veri çekiliyor...');
      const response = await axiosInstance.patch(
        `${this.baseURL}/layouts/testdb/records/1`,
        {
          fieldData: {},
          script: "getData"
        },
        {
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${token}`
          }
        }
      );
      console.log('Veri başarıyla çekildi');
      return response.data.response.scriptResult;
    } catch (error) {
      console.error('Veri çekilemedi:', error.response?.data || error.message);
      throw new Error('Veri çekilemedi: ' + error.message);
    }
  }
}

module.exports = new ApiService();