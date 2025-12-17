const { app, BrowserWindow, ipcMain } = require('electron');
const path = require('path');
//const mariadb = require('mariadb');
require('dotenv').config();
const sql = require('mssql');

// --------------------
// MariaDB Connection Pool
// --------------------
let pool = null;
let isPoolClosed = false;

// Azure SQL Configuration
const azureConfig = {
  server: process.env.AZURE_SQL_SERVER || 'pergamon.database.windows.net',
  database: process.env.AZURE_SQL_DATABASE || 'pergamon',
  user: process.env.AZURE_SQL_USER || 'pergamonadmin',
  password: process.env.AZURE_SQL_PASSWORD || 'Pergamon123.',
  port: 1433,
  options: {
    encrypt: true,
    trustServerCertificate: false,
    enableArithAbort: true,
    connectionTimeout: 30000,
    requestTimeout: 30000
  },
  pool: {
    max: 20,
    min: 0,
    idleTimeoutMillis: 30000
  }
};

async function createPool() {
  if (!pool && !isPoolClosed) {
    try {
      pool = await sql.connect(azureConfig);
      console.log('📊 Azure SQL Database pool oluşturuldu');
      
      pool.on('error', err => {
        console.error('❌ Azure SQL Pool hatası:', err);
        pool = null;
      });
      
      return pool;
    } catch (err) {
      console.error('❌ Azure SQL bağlantı hatası:', err);
      throw err;
    }
  }
  return pool;
}

async function testDBConnection() {
  try {
    const currentPool = await createPool();
    const result = await currentPool.request().query('SELECT 1 as test');
    console.log('✅ Azure SQL Database bağlantısı başarılı!');
    return true;
  } catch (err) {
    console.error('❌ Azure SQL bağlantı hatası:', err);
    return false;
  }
}

async function closePool() {
  if (pool && !isPoolClosed) {
    try {
      console.log('🔄 Pool kapatılıyor...');
      await pool.close();  // ✅ Azure SQL methodu
      isPoolClosed = true;
      pool = null;
      console.log('✅ Pool başarıyla kapatıldı');
    } catch (error) {
      console.error('❌ Pool kapatılırken hata:', error.message);
      // Pool zaten kapalıysa, sadece durumu güncelle
      isPoolClosed = true;
      pool = null;
      console.log('ℹ️ Pool durumu güncellendi');
    }
  }
}

// --------------------
// Electron Window
// --------------------
let mainWindow;

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 1400,
    height: 900,
    icon: path.join(__dirname, './public/img/bergama-logo.ico'),
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, 'preload.js'),
      contextIsolation: true,
      nodeIntegration: false,
      enableRemoteModule: false
    },
    show: false
  });

  mainWindow.loadFile('index.html');

  // Window hazır olunca göster
  mainWindow.once('ready-to-show', () => {
    mainWindow.show();
  });

  // Development modunda DevTools aç
  if (process.env.NODE_ENV === 'development') {
    mainWindow.webContents.openDevTools();
  }

  // Window kapandığında pool'u kapat
  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

// --------------------
// Genel Database Fonksiyonları
// --------------------
async function runQuery(query, params = []) {
  try {
    const currentPool = await createPool();

    if (isPoolClosed) {
      throw new Error('Database pool is closed');
    }

    console.log('🔧 SQL Sorgusu çalıştırılıyor:', {
      query: query.substring(0, 100) + '...',
      paramCount: params.length,
      nullParams: params.filter(p => p === null).length
    });

    // ⭐ AZURE SQL İÇİN QUERY DÖNÜŞÜMLERİ
    let processedQuery = query;
    
    // DATE() -> CAST(... AS DATE)
    processedQuery = processedQuery.replace(/DATE\(([^)]+)\)/gi, 'CAST($1 AS DATE)');
    
    // CURDATE() -> CAST(GETDATE() AS DATE)
    processedQuery = processedQuery.replace(/CURDATE\(\)/gi, 'CAST(GETDATE() AS DATE)');
    
    // NOW() -> GETDATE()
    processedQuery = processedQuery.replace(/NOW\(\)/gi, 'GETDATE()');
    
    // DATE_ADD(date, INTERVAL n DAY) -> DATEADD(DAY, n, date)
    processedQuery = processedQuery.replace(
      /DATE_ADD\(([^,]+),\s*INTERVAL\s+(\d+)\s+DAY\)/gi,
      'DATEADD(DAY, $2, $1)'
    );
    
    // DATE_SUB(date, INTERVAL n DAY) -> DATEADD(DAY, -n, date)
    processedQuery = processedQuery.replace(
      /DATE_SUB\(([^,]+),\s*INTERVAL\s+(\d+)\s+DAY\)/gi,
      'DATEADD(DAY, -$2, $1)'
    );

    const request = currentPool.request();
    
    // Parametreleri ekle
    params.forEach((param, index) => {
      request.input(`param${index}`, param);
    });
    
    // ? işaretlerini @param0, @param1 ile değiştir
    params.forEach((_, index) => {
      processedQuery = processedQuery.replace('?', `@param${index}`);
    });

    const result = await request.query(processedQuery);
    return result.recordset || [];
    
  } catch (err) {
    console.error("❌ SQL Hatası:", {
      message: err.message,
      code: err.code,
      number: err.number,
      state: err.state,
      query: query.substring(0, 200) + '...'
    });
    return { error: err.message };
  }
}

function formatDateTurkish(dateString) {
  if (!dateString) return 'Belirtilmemiş';
  
  try {
    const date = new Date(dateString);
    if (isNaN(date.getTime())) return 'Geçersiz Tarih';
    
    return date.toLocaleDateString('tr-TR', {
      day: '2-digit',
      month: '2-digit', 
      year: 'numeric'
    });
  } catch (error) {
    console.error('Tarih formatlaması hatası:', error);
    return 'Tarih Formatlanamadı';
  }
}


// --------------------
// DÖNEM İŞLEMLERİ
// --------------------
async function getDonemler() {
  const query = `
    SELECT 
      id,
      donem_numara,
      donem_turu,
      donem_durum,
      donem_ogr_adedi,
      donem_baslangic_t,
      donem_bitis_t
    FROM donemler 
    ORDER BY donem_baslangic_t DESC
  `;
  return await runQuery(query);
}

// --------------------
// ÖĞRENCİ İŞLEMLERİ
// --------------------
async function getOgrencilerByDonem(donemId) {
  const query = `
    SELECT 
      id,
      ogr_turu,
      ogr_durum,
      ogr_donem,
      ogr_rapor_tarih_no,
      ogr_silah_durum,
      ogr_TC,
      ogr_ad,
      ogr_soyad,
      ogr_baba_ad,
      ogr_anne_ad,
      ogr_dogum_yeri,
      ogr_dogum_tarihi,
      ogr_ogrenim_durumu,
      ogr_ceptel,
      ogr_kan_grubu,
      ogr_mail,
      ogr_yedek_ceptel,
      ogr_kayit_tarihi,
      ogr_adres,
      ogr_gerek_foto,
      ogr_gerek_diploma,
      ogr_gerek_kimlik,
      ogr_gerek_yakakarti,
      ogr_gerek_saglik,
      ogr_gerek_ikamet,
      ogr_odeme,
      ogr_sinav_puan,
      ogr_gecti,
      ogr_not,                    -- ← BU SATIR EKSİKTİ!
      ogr_sinav_puan_tarih
    FROM ogrenciler 
    WHERE ogr_donem = ?
    ORDER BY ogr_kayit_tarihi DESC, ogr_ad ASC
  `;
  return await runQuery(query, [donemId]);
}

async function getOgrenciById(ogrenciId) {
  const query = `
    SELECT 
      id,
      ogr_turu,
      ogr_durum,
      ogr_donem,
      ogr_rapor_tarih_no,
      ogr_silah_durum,
      ogr_TC,
      ogr_ad,
      ogr_soyad,
      ogr_baba_ad,
      ogr_anne_ad,
      ogr_dogum_yeri,
      ogr_dogum_tarihi,
      ogr_ogrenim_durumu,
      ogr_ceptel,
      ogr_kan_grubu,
      ogr_mail,
      ogr_yedek_ceptel,
      ogr_kayit_tarihi,
      ogr_adres,
      ogr_gerek_foto,
      ogr_gerek_diploma,
      ogr_gerek_kimlik,
      ogr_gerek_yakakarti,
      ogr_gerek_saglik,
      ogr_gerek_ikamet,
      ogr_odeme,
      ogr_sinav_puan,
      ogr_gecti,
      ogr_not,                    -- ← BU SATIR EKSİKTİ!
      ogr_sinav_puan_tarih
    FROM ogrenciler 
    WHERE id = ?
  `;
  const result = await runQuery(query, [ogrenciId]);
  return result && result.length > 0 ? result[0] : null;
}

// Öğrenci ekleme (gelişmiş)
async function addOgrenciEnhanced(ogrenciData) {
  const query = `
        INSERT INTO ogrenciler (
            ogr_turu, ogr_durum, ogr_donem, ogr_rapor_tarih_no, ogr_silah_durum,
            ogr_TC, ogr_ad, ogr_soyad, ogr_baba_ad, ogr_anne_ad, ogr_dogum_yeri,
            ogr_dogum_tarihi, ogr_ogrenim_durumu, ogr_ceptel, ogr_kan_grubu,
            ogr_mail, ogr_yedek_ceptel, ogr_kayit_tarihi, ogr_adres,
            ogr_gerek_foto, ogr_gerek_diploma, ogr_gerek_kimlik,
            ogr_gerek_yakakarti, ogr_gerek_saglik, ogr_gerek_ikamet,
            ogr_odeme, ogr_sinav_puan, ogr_gecti, ogr_not, ogr_sinav_puan_tarih
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `;

  // Sınav puanı varsa geçti/kaldı hesapla
  const sinavPuan = ogrenciData.ogr_sinav_puan ? parseInt(ogrenciData.ogr_sinav_puan) : null;
  const gecti = sinavPuan !== null ? (sinavPuan >= 60 ? 1 : 0) : null;
  const sinavTarihi = sinavPuan !== null ? new Date().toISOString().split('T')[0] : null;

  const params = [
    ogrenciData.ogr_turu || null,
    ogrenciData.ogr_durum || 'Aktif',
    ogrenciData.ogr_donem || null,
    ogrenciData.ogr_rapor_tarih_no || null,
    ogrenciData.ogr_silah_durum || null,
    ogrenciData.ogr_TC || null,
    ogrenciData.ogr_ad || null,
    ogrenciData.ogr_soyad || null,
    ogrenciData.ogr_baba_ad || null,
    ogrenciData.ogr_anne_ad || null,
    ogrenciData.ogr_dogum_yeri || null,
    // Doğum tarihi için özel işlem
    (ogrenciData.ogr_dogum_tarihi && ogrenciData.ogr_dogum_tarihi.trim() !== '') ?
      ogrenciData.ogr_dogum_tarihi : null,
    ogrenciData.ogr_ogrenim_durumu || null,
    ogrenciData.ogr_ceptel || null,
    ogrenciData.ogr_kan_grubu || null,
    ogrenciData.ogr_mail || null,
    ogrenciData.ogr_yedek_ceptel || null,
    ogrenciData.ogr_kayit_tarihi || new Date().toISOString().split('T')[0],
    ogrenciData.ogr_adres || null,
    parseInt(ogrenciData.ogr_gerek_foto) || 0,
    parseInt(ogrenciData.ogr_gerek_diploma) || 0,
    parseInt(ogrenciData.ogr_gerek_kimlik) || 0,
    parseInt(ogrenciData.ogr_gerek_yakakarti) || 0,
    parseInt(ogrenciData.ogr_gerek_saglik) || 0,
    parseInt(ogrenciData.ogr_gerek_ikamet) || 0,
    parseFloat(ogrenciData.ogr_odeme) || 0,
    sinavPuan,
    gecti,
    ogrenciData.ogr_not || null,
    sinavTarihi
  ];

  const result = await runQuery(query, params);

  // Başarılı ekleme sonrası dönem öğrenci sayısını güncelle
  if (result && !result.error && ogrenciData.ogr_donem) {
    await updateDonemOgrenciSayisi(ogrenciData.ogr_donem);
  }

  return result;
}


async function deleteOgrenci(ogrenciId) {
  // Önce öğrencinin dönem bilgisini al
  const ogrenci = await getOgrenciById(ogrenciId);
  const donemId = ogrenci ? ogrenci.ogr_donem : null;

  const query = 'DELETE FROM ogrenciler WHERE id = ?';
  const result = await runQuery(query, [ogrenciId]);

  // Silme sonrası dönem öğrenci sayısını güncelle
  if (result && !result.error && donemId) {
    await updateDonemOgrenciSayisi(donemId);
  }

  return result;
}

// Dönem öğrenci sayısını otomatik güncelleme
async function updateDonemOgrenciSayisi(donemId) {
  try {
    // Dönemdeki aktif öğrenci sayısını hesapla
    const countQuery = `
      SELECT COUNT(*) as count 
      FROM ogrenciler 
      WHERE ogr_donem = ? AND ogr_durum != 'Pasif'
    `;
    const countResult = await runQuery(countQuery, [donemId]);
    const ogrenciSayisi = countResult && countResult[0] ? countResult[0].count : 0;

    // Dönem tablosunu güncelle
    const updateQuery = 'UPDATE donemler SET donem_ogr_adedi = ? WHERE id = ?';
    await runQuery(updateQuery, [ogrenciSayisi, donemId]);

    console.log(`Dönem ${donemId} öğrenci sayısı güncellendi: ${ogrenciSayisi}`);
  } catch (error) {
    console.error('Dönem öğrenci sayısı güncellenirken hata:', error);
  }
}

// Öğrenci belge durumu güncelleme
async function updateOgrenciBelgeAdvanced(ogrenciId, belgeAdi, durum) {
  const gecerliBelgeler = [
    'ogr_gerek_foto',
    'ogr_gerek_diploma',
    'ogr_gerek_kimlik',
    'ogr_gerek_yakakarti',
    'ogr_gerek_saglik',
    'ogr_gerek_ikamet'
  ];

  if (!gecerliBelgeler.includes(belgeAdi)) {
    return { error: 'Geçersiz belge adı' };
  }

  const query = `UPDATE ogrenciler SET ${belgeAdi} = ? WHERE id = ?`;
  const result = await runQuery(query, [durum ? 1 : 0, ogrenciId]);

  // Belge tamamlanma oranını hesapla ve döndür
  if (!result.error) {
    const completionResult = await getOgrenciBelgeTamamlanma(ogrenciId);
    return { success: true, completion: completionResult };
  }

  return result;
}

// Öğrenci güncelleme
async function updateOgrenci(ogrenciId, ogrenciData) {
  const query = `
        UPDATE ogrenciler SET
            ogr_turu = ?, ogr_durum = ?, ogr_donem = ?, ogr_rapor_tarih_no = ?, ogr_silah_durum = ?,
            ogr_TC = ?, ogr_ad = ?, ogr_soyad = ?, ogr_baba_ad = ?, ogr_anne_ad = ?, ogr_dogum_yeri = ?,
            ogr_dogum_tarihi = ?, ogr_ogrenim_durumu = ?, ogr_ceptel = ?, ogr_kan_grubu = ?,
            ogr_mail = ?, ogr_yedek_ceptel = ?, ogr_adres = ?,
            ogr_gerek_foto = ?, ogr_gerek_diploma = ?, ogr_gerek_kimlik = ?,
            ogr_gerek_yakakarti = ?, ogr_gerek_saglik = ?, ogr_gerek_ikamet = ?,
            ogr_odeme = ?, ogr_sinav_puan = ?, ogr_not = ?
        WHERE id = ?
    `;

  // Güvenli parametre hazırlama
  const params = [
    ogrenciData.ogr_turu || null,
    ogrenciData.ogr_durum || 'Aktif',
    ogrenciData.ogr_donem || null,
    ogrenciData.ogr_rapor_tarih_no || null,
    ogrenciData.ogr_silah_durum || null,
    ogrenciData.ogr_TC || null,
    ogrenciData.ogr_ad || null,
    ogrenciData.ogr_soyad || null,
    ogrenciData.ogr_baba_ad || null,
    ogrenciData.ogr_anne_ad || null,
    ogrenciData.ogr_dogum_yeri || null,
    // Doğum tarihi için güvenli işlem
    (ogrenciData.ogr_dogum_tarihi && ogrenciData.ogr_dogum_tarihi.trim() !== '') ?
      ogrenciData.ogr_dogum_tarihi : null,
    ogrenciData.ogr_ogrenim_durumu || null,
    ogrenciData.ogr_ceptel || null,
    ogrenciData.ogr_kan_grubu || null,
    ogrenciData.ogr_mail || null,
    ogrenciData.ogr_yedek_ceptel || null,
    ogrenciData.ogr_adres || null,
    parseInt(ogrenciData.ogr_gerek_foto) || 0,
    parseInt(ogrenciData.ogr_gerek_diploma) || 0,
    parseInt(ogrenciData.ogr_gerek_kimlik) || 0,
    parseInt(ogrenciData.ogr_gerek_yakakarti) || 0,
    parseInt(ogrenciData.ogr_gerek_saglik) || 0,
    parseInt(ogrenciData.ogr_gerek_ikamet) || 0,
    parseFloat(ogrenciData.ogr_odeme) || 0,
    parseInt(ogrenciData.ogr_sinav_puan) || null,
    ogrenciData.ogr_not || null,
    ogrenciId
  ];

  console.log('🔧 Güvenli parametre listesi hazırlandı:', {
    ogrenciId,
    dogumTarihi: params[11],
    toplamParametre: params.length
  });

  return await runQuery(query, params);
}

// Sınav puanı güncelleme
async function updateOgrenciSinavPuan(ogrenciId, sinavPuan) {
  const gecti = sinavPuan >= 60 ? 1 : 0;
  const tarih = new Date().toISOString().split('T')[0];

  const query = `
    UPDATE ogrenciler 
    SET ogr_sinav_puan = ?, ogr_gecti = ?, ogr_sinav_puan_tarih = ?
    WHERE id = ?
  `;

  return await runQuery(query, [sinavPuan, gecti, tarih, ogrenciId]);
}

// Öğrenci belge tamamlanma oranı
async function getOgrenciBelgeTamamlanma(ogrenciId) {
  const query = `
    SELECT 
      ogr_gerek_foto, ogr_gerek_diploma, ogr_gerek_kimlik,
      ogr_gerek_yakakarti, ogr_gerek_saglik, ogr_gerek_ikamet
    FROM ogrenciler WHERE id = ?
  `;

  const result = await runQuery(query, [ogrenciId]);
  if (result && result.length > 0) {
    const ogrenci = result[0];
    const belgeler = [
      ogrenci.ogr_gerek_foto,
      ogrenci.ogr_gerek_diploma,
      ogrenci.ogr_gerek_kimlik,
      ogrenci.ogr_gerek_yakakarti,
      ogrenci.ogr_gerek_saglik,
      ogrenci.ogr_gerek_ikamet
    ];

    const tamamlanan = belgeler.filter(b => b === 1).length;
    const toplam = belgeler.length;
    const oran = Math.round((tamamlanan / toplam) * 100);

    return { tamamlanan, toplam, oran };
  }

  return { tamamlanan: 0, toplam: 6, oran: 0 };
}

// Öğrenci arama ve filtreleme
async function searchOgrencilerAdvanced(searchTerm, donemId = null, durum = null, belgeFilter = null, silahDurum = null) {
  let query = `
        SELECT 
            id, ogr_turu, ogr_durum, ogr_donem, ogr_rapor_tarih_no, ogr_silah_durum,
            ogr_TC, ogr_ad, ogr_soyad, ogr_baba_ad, ogr_anne_ad, ogr_dogum_yeri,
            ogr_dogum_tarihi, ogr_ogrenim_durumu, ogr_ceptel, ogr_kan_grubu,
            ogr_mail, ogr_yedek_ceptel, ogr_kayit_tarihi, ogr_adres,
            ogr_gerek_foto, ogr_gerek_diploma, ogr_gerek_kimlik,
            ogr_gerek_yakakarti, ogr_gerek_saglik, ogr_gerek_ikamet,
            ogr_odeme, ogr_sinav_puan, ogr_gecti, ogr_not, ogr_sinav_puan_tarih
        FROM ogrenciler 
        WHERE 1=1
    `;

    const params = [];

    // Arama terimi
    if (searchTerm && searchTerm.trim()) {
        query += ` AND (ogr_ad LIKE ? OR ogr_soyad LIKE ? OR ogr_TC LIKE ?)`;
        const searchPattern = `%${searchTerm.trim()}%`;
        params.push(searchPattern, searchPattern, searchPattern);
    }

    // Dönem filtresi
    if (donemId) {
        query += ` AND ogr_donem = ?`;
        params.push(donemId);
    }

    // Durum filtresi
    if (durum && durum !== 'all') {
        query += ` AND ogr_durum = ?`;
        params.push(durum);
    }

    // SİLAH DURUMU FİLTRESİ - EN ÖNEMLİ KISIM!
    if (silahDurum && silahDurum !== 'all') {
        console.log('🔫 Silah durumu filtresi uygulanıyor:', silahDurum);
        query += ` AND ogr_silah_durum = ?`;
        params.push(silahDurum);
    }

    query += ` ORDER BY ogr_kayit_tarihi DESC, ogr_ad ASC`;

    console.log('🔍 SQL Sorgusu:', query);
    console.log('📋 Parametreler:', params);

    try {
        const result = await runQuery(query, params);
        
        // Belge filtresi varsa uygula (opsiyonel)
        let filteredResult = result || [];
        
        if (belgeFilter && belgeFilter !== 'all-docs' && filteredResult.length > 0) {
            filteredResult = filteredResult.filter(ogrenci => {
                const belgeler = [
                    ogrenci.ogr_gerek_foto,
                    ogrenci.ogr_gerek_diploma,
                    ogrenci.ogr_gerek_kimlik,
                    ogrenci.ogr_gerek_yakakarti,
                    ogrenci.ogr_gerek_saglik,
                    ogrenci.ogr_gerek_ikamet
                ];

                const tamamlanan = belgeler.filter(b => b === 1).length;
                const toplam = belgeler.length;

                if (belgeFilter === 'complete') {
                    return tamamlanan === toplam;
                } else if (belgeFilter === 'incomplete') {
                    return tamamlanan < toplam;
                }

                return true;
            });
        }

        console.log(`✅ searchOgrencilerAdvanced: ${filteredResult.length} öğrenci bulundu`);
        return filteredResult;
        
    } catch (error) {
        console.error('❌ searchOgrencilerAdvanced hatası:', error);
        return [];
    }
}

// İstatistikler
async function getOgrenciIstatistikleri(donemId = null) {
  let whereClause = donemId ? 'WHERE ogr_donem = ?' : '';
  let params = donemId ? [donemId] : [];

  const queries = {
    toplam: `SELECT COUNT(*) as count FROM ogrenciler ${whereClause}`,
    aktif: `SELECT COUNT(*) as count FROM ogrenciler ${whereClause} ${donemId ? 'AND' : 'WHERE'} ogr_durum = 'Aktif'`,
    mezun: `SELECT COUNT(*) as count FROM ogrenciler ${whereClause} ${donemId ? 'AND' : 'WHERE'} ogr_durum = 'Mezun'`,
    gecenler: `SELECT COUNT(*) as count FROM ogrenciler ${whereClause} ${donemId ? 'AND' : 'WHERE'} ogr_gecti = 1`,
    ortalamaPuan: `SELECT AVG(ogr_sinav_puan) as avg FROM ogrenciler ${whereClause} ${donemId ? 'AND' : 'WHERE'} ogr_sinav_puan IS NOT NULL`,
    toplamOdeme: `SELECT SUM(ogr_odeme) as sum FROM ogrenciler ${whereClause}`,
    belgeTamamlama: `
      SELECT 
        AVG(
          (ogr_gerek_foto + ogr_gerek_diploma + ogr_gerek_kimlik + 
           ogr_gerek_yakakarti + ogr_gerek_saglik + ogr_gerek_ikamet) / 6.0 * 100
        ) as avg
      FROM ogrenciler ${whereClause}
    `
  };

  const results = {};

  for (const [key, query] of Object.entries(queries)) {
    const result = await runQuery(query, params);
    if (result && result.length > 0) {
      if (key === 'ortalamaPuan') {
        results[key] = Math.round(result[0].avg || 0);
      } else if (key === 'belgeTamamlama') {
        results[key] = Math.round(result[0].avg || 0);
      } else if (key === 'toplamOdeme') {
        results[key] = result[0].sum || 0;
      } else {
        results[key] = result[0].count || 0;
      }
    } else {
      results[key] = 0;
    }
  }

  return results;
}

// Dönem raporu
async function getDonemRapor(donemId) {
  const ogrenciler = await getOgrencilerByDonem(donemId);
  const stats = await getOgrenciIstatistikleri(donemId);
  const donem = await runQuery('SELECT * FROM donemler WHERE id = ?', [donemId]);

  return {
    donem: donem && donem.length > 0 ? donem[0] : null,
    ogrenciler,
    istatistikler: stats
  };
}

// --------------------
// IPC HANDLERS
// --------------------

// Dönem işlemleri
ipcMain.handle('get-donemler', async () => {
  return await getDonemler();
});

// Öğrenci işlemleri
ipcMain.handle('get-ogrenciler-by-donem', async (event, donemId) => {
  return await getOgrencilerByDonem(donemId);
});

ipcMain.handle('get-ogrenci-by-id', async (event, ogrenciId) => {
  return await getOgrenciById(ogrenciId);
});

ipcMain.handle('add-ogrenci', async (event, ogrenciData) => {
  return await addOgrenci(ogrenciData);
});

ipcMain.handle('delete-ogrenci', async (event, ogrenciId) => {
  return await deleteOgrenci(ogrenciId);
});

// Belge yönetimi
ipcMain.handle('update-ogrenci-belge', async (event, ogrenciId, belgeAdi, durum) => {
  return await updateOgrenciBelge(ogrenciId, belgeAdi, durum);
});

// Genel query runner
ipcMain.handle('run-query', async (event, query, params) => {
  return await runQuery(query, params);
});

// Gelişmiş öğrenci işlemleri
ipcMain.handle('add-ogrenci-enhanced', async (event, ogrenciData) => {
  return await addOgrenciEnhanced(ogrenciData);
});

ipcMain.handle('update-ogrenci', async (event, ogrenciId, ogrenciData) => {
  return await updateOgrenci(ogrenciId, ogrenciData);
});

ipcMain.handle('update-ogrenci-sinav-puan', async (event, ogrenciId, sinavPuan) => {
  return await updateOgrenciSinavPuan(ogrenciId, sinavPuan);
});

ipcMain.handle('update-ogrenci-belge-advanced', async (event, ogrenciId, belgeAdi, durum) => {
  return await updateOgrenciBelgeAdvanced(ogrenciId, belgeAdi, durum);
});

ipcMain.handle('get-ogrenci-belge-tamamlanma', async (event, ogrenciId) => {
  return await getOgrenciBelgeTamamlanma(ogrenciId);
});

ipcMain.handle('search-ogrenciler-advanced', async (event, searchTerm, donemId, durum, belgeFilter, silahDurum) => {
    return await searchOgrencilerAdvanced(searchTerm, donemId, durum, belgeFilter, silahDurum);
});

ipcMain.handle('get-ogrenci-istatistikleri', async (event, donemId) => {
  return await getOgrenciIstatistikleri(donemId);
});

ipcMain.handle('get-donem-rapor', async (event, donemId) => {
  return await getDonemRapor(donemId);
});

console.log('🚀 Gelişmiş öğrenci yönetim fonksiyonları yüklendi!');

// --------------------
// App Events (DÜZENLENEN KISIM)
// --------------------
app.whenReady().then(async () => {
  await testDBConnection();
  createWindow();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on('window-all-closed', async () => {
  console.log('📱 Tüm pencereler kapatıldı');
  await closePool();

  if (process.platform !== 'darwin') {
    app.quit();
  }
});

app.on('before-quit', async (event) => {
  console.log('🔄 Uygulama kapatılıyor...');

  if (!isPoolClosed) {
    event.preventDefault(); // Kapatmayı durdur
    await closePool();
    app.quit(); // Şimdi güvenle kapat
  }
});

// Graceful shutdown için SIGINT ve SIGTERM dinle
process.on('SIGINT', async () => {
  console.log('📡 SIGINT sinyali alındı, graceful shutdown...');
  await closePool();
  process.exit(0);
});

process.on('SIGTERM', async () => {
  console.log('📡 SIGTERM sinyali alındı, graceful shutdown...');
  await closePool();
  process.exit(0);
});

// Beklenmeyen hatalar için
process.on('uncaughtException', async (error) => {
  console.error('💥 Beklenmeyen hata:', error);
  await closePool();
  process.exit(1);
});

process.on('unhandledRejection', async (reason, promise) => {
  console.error('🔥 İşlenmemiş Promise reddi:', reason);
  await closePool();
  process.exit(1);
});

// TC Kimlik doğrulama
async function validateTCKimlik(tcNo) {
  if (!tcNo || tcNo.length !== 11) return false;

  const digits = tcNo.split('').map(Number);

  // İlk hane 0 olamaz
  if (digits[0] === 0) return false;

  // 10. hane kontrolü
  const oddSum = digits[0] + digits[2] + digits[4] + digits[6] + digits[8];
  const evenSum = digits[1] + digits[3] + digits[5] + digits[7];
  const control10 = ((oddSum * 7) - evenSum) % 10;

  if (control10 !== digits[9]) return false;

  // 11. hane kontrolü
  const totalSum = digits.slice(0, 10).reduce((sum, digit) => sum + digit, 0);
  const control11 = totalSum % 10;

  return control11 === digits[10];
}

// Öğrenci tekrar kontrolü
async function checkDuplicateStudent(tcNo, donemId, excludeId = null) {
  let query = 'SELECT COUNT(*) as count FROM ogrenciler WHERE ogr_TC = ? AND ogr_donem = ?';
  let params = [tcNo, donemId];

  if (excludeId) {
    query += ' AND id != ?';
    params.push(excludeId);
  }

  const result = await runQuery(query, params);
  return result && result[0] && result[0].count > 0;
}

// Öğrenci not güncelleme
async function updateOgrenciNot(ogrenciId, not) {
  const query = 'UPDATE ogrenciler SET ogr_not = ? WHERE id = ?';
  return await runQuery(query, [not, ogrenciId]);
}

// Öğrenci ödeme güncelleme
async function updateOgrenciOdeme(ogrenciId, odeme) {
  const query = 'UPDATE ogrenciler SET ogr_odeme = ? WHERE id = ?';
  return await runQuery(query, [parseFloat(odeme) || 0, ogrenciId]);
}

// Toplu belge güncelleme
async function bulkUpdateBelgeler(ogrenciIds, belgeAdi, durum) {
  const gecerliBelgeler = [
    'ogr_gerek_foto', 'ogr_gerek_diploma', 'ogr_gerek_kimlik',
    'ogr_gerek_yakakarti', 'ogr_gerek_saglik', 'ogr_gerek_ikamet'
  ];

  if (!gecerliBelgeler.includes(belgeAdi)) {
    return { error: 'Geçersiz belge adı' };
  }

  const placeholders = ogrenciIds.map(() => '?').join(',');
  const query = `UPDATE ogrenciler SET ${belgeAdi} = ? WHERE id IN (${placeholders})`;
  const params = [durum ? 1 : 0, ...ogrenciIds];

  return await runQuery(query, params);
}

// Toplu durum güncelleme
async function bulkUpdateDurum(ogrenciIds, yeniDurum) {
  const placeholders = ogrenciIds.map(() => '?').join(',');
  const query = `UPDATE ogrenciler SET ogr_durum = ? WHERE id IN (${placeholders})`;
  const params = [yeniDurum, ...ogrenciIds];

  return await runQuery(query, params);
}

// Ödeme istatistikleri
async function getOdemeIstatistikleri(donemId = null) {
  let whereClause = donemId ? 'WHERE ogr_donem = ?' : '';
  let params = donemId ? [donemId] : [];

  const queries = {
    toplamOdeme: `SELECT SUM(ogr_odeme) as sum FROM ogrenciler ${whereClause}`,
    odenenOgrenci: `SELECT COUNT(*) as count FROM ogrenciler ${whereClause} ${donemId ? 'AND' : 'WHERE'} ogr_odeme > 0`,
    bekleyenOgrenci: `SELECT COUNT(*) as count FROM ogrenciler ${whereClause} ${donemId ? 'AND' : 'WHERE'} ogr_odeme = 0`,
    ortalamaOdeme: `SELECT AVG(ogr_odeme) as avg FROM ogrenciler ${whereClause} ${donemId ? 'AND' : 'WHERE'} ogr_odeme > 0`
  };

  const results = {};

  for (const [key, query] of Object.entries(queries)) {
    const result = await runQuery(query, params);
    if (result && result.length > 0) {
      if (key === 'ortalamaOdeme') {
        results[key] = Math.round(result[0].avg || 0);
      } else if (key === 'toplamOdeme') {
        results[key] = result[0].sum || 0;
      } else {
        results[key] = result[0].count || 0;
      }
    } else {
      results[key] = 0;
    }
  }

  return results;
}

// IPC Handler'ları ekleyin (mevcut ipcMain.handle'ların sonuna):

// Validasyon
ipcMain.handle('validate-tc-kimlik', async (event, tcNo) => {
  return await validateTCKimlik(tcNo);
});

ipcMain.handle('check-duplicate-student', async (event, tcNo, donemId, excludeId) => {
  return await checkDuplicateStudent(tcNo, donemId, excludeId);
});

// Not ve ödeme
ipcMain.handle('update-ogrenci-not', async (event, ogrenciId, not) => {
  return await updateOgrenciNot(ogrenciId, not);
});

ipcMain.handle('update-ogrenci-odeme', async (event, ogrenciId, odeme) => {
  return await updateOgrenciOdeme(ogrenciId, odeme);
});

// Toplu işlemler
ipcMain.handle('bulk-update-belgeler', async (event, ogrenciIds, belgeAdi, durum) => {
  return await bulkUpdateBelgeler(ogrenciIds, belgeAdi, durum);
});

ipcMain.handle('bulk-update-durum', async (event, ogrenciIds, yeniDurum) => {
  return await bulkUpdateDurum(ogrenciIds, yeniDurum);
});

// İstatistikler
ipcMain.handle('get-odeme-istatistikleri', async (event, donemId) => {
  return await getOdemeIstatistikleri(donemId);
});

ipcMain.handle('debug-student-notes', async (event, studentId) => {
  return await debugStudentNotes(studentId);
});

// Ödeme işlemleri için IPC handlers
ipcMain.handle('get-odemeler', async () => {
  try {
    const query = `
      SELECT 
        o.*,
        og.ogr_ad,
        og.ogr_soyad, 
        og.ogr_TC,
        og.ogr_odeme as toplam_ucret,
        d.donem_numara,
        d.donem_turu,
        COALESCE(SUM(od.odenen_tutar), 0) as toplam_odenen
      FROM ogrenciler og
      LEFT JOIN odemeler od ON og.id = od.ogr_id
      LEFT JOIN donemler d ON og.ogr_donem = d.id
      GROUP BY og.id
      ORDER BY og.ogr_ad, og.ogr_soyad
    `;
    
    const rows = await runQuery(query);
    
    // Her öğrenci için kalan borç hesapla
    const results = rows.map(row => ({
      ...row,
      kalan_borc: (row.toplam_ucret || 0) - (row.toplam_odenen || 0),
      odeme_durumu: calculatePaymentStatus(row)
    }));
    
    return results;
  } catch (error) {
    console.error('Ödemeler getirilemedi:', error);
    return { error: error.message };
  }
});

// Ödeme ekleme
ipcMain.handle('add-odeme', async (event, paymentData) => {
  try {
    const query = `
      INSERT INTO odemeler 
      (ogr_id, odenen_tutar, odeme_tarihi, son_odeme_tarihi, odeme_yontemi, durum, not)
      VALUES (?, ?, ?, ?, ?, ?, ?)
    `;
    
    const params = [
      paymentData.ogr_id,
      paymentData.odenen_tutar,
      paymentData.odeme_tarihi || new Date().toISOString().split('T')[0],
      paymentData.son_odeme_tarihi,
      paymentData.odeme_yontemi || 'nakit',
      paymentData.durum || 'odendi',
      paymentData.not || ''
    ];
    
    const result = await runQuery(query, params);
    
    // Öğrencinin toplam ödemesini güncelle
    await updateStudentPaymentStatus(paymentData.ogr_id);
    
    return result;
  } catch (error) {
    console.error('Ödeme eklenemedi:', error);
    return { error: error.message };
  }
});

console.log('✅ Öğrenci not sorguları düzeltildi!');

console.log("✅ Tüm eksik IPC handler'lar eklendi!");

// Öğrencinin ödeme durumunu hesaplama
async function updateStudentPaymentStatus(studentId) {
  try {
    const query = `
      SELECT 
        og.ogr_odeme as toplam_ucret,
        COALESCE(SUM(od.odenen_tutar), 0) as toplam_odenen
      FROM ogrenciler og
      LEFT JOIN odemeler od ON og.id = od.ogr_id
      WHERE og.id = ?
      GROUP BY og.id
    `;
    
    const result = await runQuery(query, [studentId]);
    
    if (result.length > 0) {
      const { toplam_ucret, toplam_odenen } = result[0];
      const kalan = toplam_ucret - toplam_odenen;
      
      // Öğrenci tablosunda durumu güncelle (isteğe bağlı)
      if (kalan <= 0) {
        await runQuery(
          'UPDATE ogrenciler SET ogr_odeme_durumu = ? WHERE id = ?',
          ['tamam', studentId]
        );
      }
    }
  } catch (error) {
    console.error('Ödeme durumu güncellenemedi:', error);
  }
}

// Ödeme durumu hesaplama helper
function calculatePaymentStatus(paymentData) {
  const toplam = paymentData.toplam_ucret || 0;
  const odenen = paymentData.toplam_odenen || 0;
  
  if (odenen >= toplam) return 'paid';
  if (odenen > 0) return 'partial';
  return 'pending';
}

// Ödeme istatistikleri
ipcMain.handle('get-payment-stats', async () => {
  try {
    const query = `
      SELECT 
        COUNT(DISTINCT og.id) as toplam_ogrenci,
        SUM(og.ogr_odeme) as toplam_beklenen,
        COALESCE(SUM(od.odenen_tutar), 0) as toplam_odenen,
        COUNT(DISTINCT od.ogr_id) as odeme_yapan_sayisi
      FROM ogrenciler og
      LEFT JOIN odemeler od ON og.id = od.ogr_id
    `;
    
    const result = await runQuery(query);
    
    if (result.length > 0) {
      const stats = result[0];
      return {
        toplam_beklenen: stats.toplam_beklenen || 0,
        toplam_odenen: stats.toplam_odenen || 0,
        kalan: (stats.toplam_beklenen || 0) - (stats.toplam_odenen || 0),
        odeme_yapan: stats.odeme_yapan_sayisi || 0,
        bekleyen: stats.toplam_ogrenci - stats.odeme_yapan_sayisi
      };
    }
    
    return {};
  } catch (error) {
    console.error('Ödeme istatistikleri alınamadı:', error);
    return { error: error.message };
  }
});

// --------------------
// ÖDEME İŞLEMLERİ
// --------------------

// Tüm ödemeleri getir - öğrenci bilgileriyle birlikte
async function getOdemeler() {
  const query = `
    SELECT 
      o.id,
      o.ogr_id,
      o.odeme_turu,
      o.odenen_tutar,
      o.odeme_tarihi,
      o.odeme_yontemi,
      o.durum,
      o.notlar,
      o.created_at,
      o.updated_at,
      og.ogr_ad,
      og.ogr_soyad,
      og.ogr_TC,
      d.donem_numara,
      d.donem_turu
    FROM odemeler o
    LEFT JOIN ogrenciler og ON o.ogr_id = og.id  
    LEFT JOIN donemler d ON og.ogr_donem = d.id
    ORDER BY o.odeme_tarihi DESC, o.created_at DESC
  `;
  return await runQuery(query);
}

// Belirli öğrencinin ödemelerini getir
async function getOdemelerByOgrenci(ogrenciId) {
  const query = `
    SELECT 
      o.id,
      o.ogr_id,
      o.odeme_turu,
      o.odenen_tutar,
      o.odeme_tarihi,
      o.odeme_yontemi,
      o.durum,
      o.notlar,
      o.created_at,
      o.updated_at
    FROM odemeler o
    WHERE o.ogr_id = ?
    ORDER BY o.odeme_tarihi DESC, o.created_at DESC
  `;
  return await runQuery(query, [ogrenciId]);
}

// Ödeme istatistiklerini getir
async function getPaymentStats() {
  const query = `
    SELECT 
      COUNT(*) as toplam_odeme_sayisi,
      SUM(CASE WHEN durum = 'odendi' THEN odenen_tutar ELSE 0 END) as toplam_odenen,
      SUM(CASE WHEN durum = 'bekliyor' THEN odenen_tutar ELSE 0 END) as bekleyen_tutar,
      SUM(CASE WHEN durum = 'geciken' THEN odenen_tutar ELSE 0 END) as geciken_tutar,
      COUNT(CASE WHEN durum = 'bekliyor' THEN 1 END) as bekleyen_sayisi,
      COUNT(CASE WHEN durum = 'geciken' THEN 1 END) as geciken_sayisi,
      COUNT(CASE WHEN durum = 'odendi' THEN 1 END) as odenen_sayisi
    FROM odemeler
  `;
  
  const result = await runQuery(query);
  return result && result.length > 0 ? result[0] : null;
}

// Yeni ödeme ekle
async function addOdeme(odemeData) {
  const query = `
    INSERT INTO odemeler (
      ogr_id, 
      odeme_turu, 
      odenen_tutar, 
      odeme_tarihi, 
      odeme_yontemi, 
      durum, 
      notlar
    ) VALUES (?, ?, ?, ?, ?, ?, ?)
  `;
  
  const params = [
    odemeData.ogr_id,
    odemeData.odeme_turu,
    odemeData.odenen_tutar,
    odemeData.odeme_tarihi,
    odemeData.odeme_yontemi,
    odemeData.durum,
    odemeData.notlar
  ];
  
  return await runQuery(query, params);
}

// Ödeme güncelle
async function updateOdeme(odemeId, odemeData) {
  const query = `
    UPDATE odemeler 
    SET 
      odeme_turu = ?, 
      odenen_tutar = ?, 
      odeme_tarihi = ?, 
      odeme_yontemi = ?, 
      durum = ?, 
      notlar = ?,
      updated_at = NOW()
    WHERE id = ?
  `;
  
  const params = [
    odemeData.odeme_turu,
    odemeData.odenen_tutar,
    odemeData.odeme_tarihi,
    odemeData.odeme_yontemi,
    odemeData.durum,
    odemeData.notlar,
    odemeId
  ];
  
  return await runQuery(query, params);
}

// Ödeme sil
async function deleteOdeme(odemeId) {
  const query = 'DELETE FROM odemeler WHERE id = ?';
  return await runQuery(query, [odemeId]);
}

// Belirli dönemin ödemelerini getir
async function getOdemelerByDonem(donemId) {
  const query = `
    SELECT 
      o.id,
      o.ogr_id,
      o.odeme_turu,
      o.odenen_tutar,
      o.odeme_tarihi,
      o.odeme_yontemi,
      o.durum,
      o.notlar,
      o.created_at,
      o.updated_at,
      og.ogr_ad,
      og.ogr_soyad,
      og.ogr_TC,
      d.donem_numara,
      d.donem_turu
    FROM odemeler o
    LEFT JOIN ogrenciler og ON o.ogr_id = og.id  
    LEFT JOIN donemler d ON og.ogr_donem = d.id
    WHERE og.ogr_donem = ?
    ORDER BY o.odeme_tarihi DESC, o.created_at DESC
  `;
  return await runQuery(query, [donemId]);
}

// Tarih aralığına göre ödemeleri getir
async function getOdemelerByDateRange(startDate, endDate) {
  const query = `
    SELECT 
      o.id,
      o.ogr_id,
      o.odeme_turu,
      o.odenen_tutar,
      o.odeme_tarihi,
      o.odeme_yontemi,
      o.durum,
      o.notlar,
      o.created_at,
      o.updated_at,
      og.ogr_ad,
      og.ogr_soyad,
      og.ogr_TC,
      d.donem_numara,
      d.donem_turu
    FROM odemeler o
    LEFT JOIN ogrenciler og ON o.ogr_id = og.id  
    LEFT JOIN donemler d ON og.ogr_donem = d.id
    WHERE o.odeme_tarihi BETWEEN ? AND ?
    ORDER BY o.odeme_tarihi DESC, o.created_at DESC
  `;
  return await runQuery(query, [startDate, endDate]);
}

// Duruma göre ödemeleri getir
async function getOdemelerByDurum(durum) {
  const query = `
    SELECT 
      o.id,
      o.ogr_id,
      o.odeme_turu,
      o.odenen_tutar,
      o.odeme_tarihi,
      o.odeme_yontemi,
      o.durum,
      o.notlar,
      o.created_at,
      o.updated_at,
      og.ogr_ad,
      og.ogr_soyad,
      og.ogr_TC,
      d.donem_numara,
      d.donem_turu
    FROM odemeler o
    LEFT JOIN ogrenciler og ON o.ogr_id = og.id  
    LEFT JOIN donemler d ON og.ogr_donem = d.id
    WHERE o.durum = ?
    ORDER BY o.odeme_tarihi DESC, o.created_at DESC
  `;
  return await runQuery(query, [durum]);
}

// =============================================================================
// ÖDEMELER IPC HANDLER'LARI - main.js'e eklenecek (app.whenReady() içinde)
// =============================================================================

// Ödemeler
ipcMain.handle('getOdemeler', async () => {
  return await getOdemeler();
});

ipcMain.handle('getOdemelerByOgrenci', async (event, ogrenciId) => {
  return await getOdemelerByOgrenci(ogrenciId);
});

ipcMain.handle('getPaymentStats', async () => {
  return await getPaymentStats();
});

ipcMain.handle('addOdeme', async (event, odemeData) => {
  return await addOdeme(odemeData);
});

ipcMain.handle('updateOdeme', async (event, odemeId, odemeData) => {
  return await updateOdeme(odemeId, odemeData);
});

ipcMain.handle('deleteOdeme', async (event, odemeId) => {
  return await deleteOdeme(odemeId);
});

ipcMain.handle('getOdemelerByDonem', async (event, donemId) => {
  return await getOdemelerByDonem(donemId);
});

ipcMain.handle('getOdemelerByDateRange', async (event, startDate, endDate) => {
  return await getOdemelerByDateRange(startDate, endDate);
});

ipcMain.handle('getOdemelerByDurum', async (event, durum) => {
  return await getOdemelerByDurum(durum);
});

// Öğrencileri ödeme bilgileriyle getir
ipcMain.handle('get-ogrenciler-with-payments', async (event, donemId) => {
    try {
        const query = `
            SELECT 
                og.*,
                COALESCE(SUM(od.odenen_tutar), 0) as toplam_odenen,
                COUNT(od.id) as odeme_sayisi,
                MAX(od.odeme_tarihi) as son_odeme_tarihi
            FROM ogrenciler og
            LEFT JOIN odemeler od ON og.id = od.ogr_id
            WHERE og.ogr_donem = ?
            GROUP BY og.id
            ORDER BY og.ogr_ad, og.ogr_soyad
        `;
        
        const students = await runQuery(query, [donemId]);
        
        return students.map(student => ({
            ...student,
            kalan_borc: (parseFloat(student.ogr_odeme) || 0) - (parseFloat(student.toplam_odenen) || 0),
            odeme_yuzdesi: student.ogr_odeme > 0 ? 
                Math.round((parseFloat(student.toplam_odenen) / parseFloat(student.ogr_odeme)) * 100) : 0
        }));
    } catch (error) {
        console.error('Öğrenci ödeme verileri getirilemedi:', error);
        return { error: error.message };
    }
});

// --------------------
// BİLDİRİM CRUD İŞLEMLERİ
// --------------------

// Tüm bildirimleri getir
async function getBildirimler() {
  const query = `
    SELECT 
      b.id, b.baslik, b.mesaj, b.turu, b.oncelik, b.okundu,
      b.olusturma_tarihi, b.okunma_tarihi, b.ogr_id, b.donem_id,
      b.sinav_puan_tarihi, b.hedef_tarih, b.bildirim_anahtari,
      -- Öğrenci bilgileri (varsa)
      o.ogr_ad, o.ogr_soyad, o.ogr_TC, o.ogr_ceptel,
      -- Dönem bilgileri (varsa) 
      d.donem_numara, d.donem_turu
    FROM bildirimler b
    LEFT JOIN ogrenciler o ON b.ogr_id = o.id
    LEFT JOIN donemler d ON b.donem_id = d.id
    WHERE b.aktif = 1
    ORDER BY b.olusturma_tarihi DESC
  `;
  return await runQuery(query);
}

// Bildirim türüne göre getir
async function getBildirimlerByTur(tur) {
  const query = `
    SELECT 
      b.id, b.baslik, b.mesaj, b.turu, b.oncelik, b.okundu,
      b.olusturma_tarihi, b.okunma_tarihi, b.ogr_id, b.donem_id,
      o.ogr_ad, o.ogr_soyad, o.ogr_TC, o.ogr_ceptel,
      d.donem_numara, d.donem_turu
    FROM bildirimler b
    LEFT JOIN ogrenciler o ON b.ogr_id = o.id
    LEFT JOIN donemler d ON b.donem_id = d.id
    WHERE b.aktif = 1 AND b.turu = ?
    ORDER BY b.olusturma_tarihi DESC
  `;
  return await runQuery(query, [tur]);
}

// Okunmamış bildirimleri getir
async function getOkunmamisBildirimler() {
  const query = `
    SELECT 
      b.id, b.baslik, b.mesaj, b.turu, b.oncelik, b.okundu,
      b.olusturma_tarihi, b.ogr_id, b.donem_id,
      o.ogr_ad, o.ogr_soyad, o.ogr_TC, o.ogr_ceptel,
      d.donem_numara, d.donem_turu
    FROM bildirimler b
    LEFT JOIN ogrenciler o ON b.ogr_id = o.id
    LEFT JOIN donemler d ON b.donem_id = d.id
    WHERE b.aktif = 1 AND b.okundu = 0
    ORDER BY b.oncelik DESC, b.olusturma_tarihi DESC
  `;
  return await runQuery(query);
}

// Bildirim istatistikleri
async function getBildirimStats() {
  const query = `
    SELECT 
      COUNT(*) as toplam,
      COUNT(CASE WHEN okundu = 0 THEN 1 END) as okunmamis,
      COUNT(CASE WHEN oncelik = 'acil' AND okundu = 0 THEN 1 END) as acil,
      COUNT(CASE WHEN oncelik = 'onemli' AND okundu = 0 THEN 1 END) as onemli,
      COUNT(CASE WHEN turu = 'egitim' AND okundu = 0 THEN 1 END) as egitim,
      COUNT(CASE WHEN turu = 'odeme' AND okundu = 0 THEN 1 END) as odeme,
      COUNT(CASE WHEN turu = 'belge' AND okundu = 0 THEN 1 END) as belge,
      COUNT(CASE WHEN turu = 'kimlik_suresi' AND okundu = 0 THEN 1 END) as kimlik,
      COUNT(CASE WHEN DATE(olusturma_tarihi) = CURDATE() THEN 1 END) as bugun
    FROM bildirimler 
    WHERE aktif = 1
  `;
  const result = await runQuery(query);
  return result && result.length > 0 ? result[0] : null;
}

// Bildirim ekleme
async function addBildirim(bildirimData) {
  // Anahtar oluştur (tekrar önleme için)
  const anahtar = bildirimData.bildirim_anahtari || 
    `${bildirimData.turu}_${bildirimData.ogr_id || 0}_${bildirimData.donem_id || 0}_${bildirimData.hedef_tarih || 'none'}`;

  // Aynı anahtar var mı kontrol et
  const existingQuery = 'SELECT id FROM bildirimler WHERE bildirim_anahtari = ? AND aktif = 1';
  const existing = await runQuery(existingQuery, [anahtar]);
  
  if (existing && existing.length > 0) {
    console.log('⚠️ Aynı bildirim zaten mevcut:', anahtar);
    return { error: 'Bildirim zaten mevcut' };
  }

  const query = `
    INSERT INTO bildirimler (
      baslik, mesaj, turu, oncelik, ogr_id, donem_id,
      sinav_puan_tarihi, hedef_tarih, bildirim_anahtari
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `;
  
  const params = [
    bildirimData.baslik,
    bildirimData.mesaj,
    bildirimData.turu,
    bildirimData.oncelik || 'bilgi',
    bildirimData.ogr_id || null,
    bildirimData.donem_id || null,
    bildirimData.sinav_puan_tarihi || null,
    bildirimData.hedef_tarih || null,
    anahtar
  ];
  
  return await runQuery(query, params);
}

// Bildirim okundu işaretleme
async function markBildirimOkundu(bildirimId) {
  const query = `
    UPDATE bildirimler 
    SET okundu = 1, okunma_tarihi = NOW()
    WHERE id = ? AND aktif = 1
  `;
  return await runQuery(query, [bildirimId]);
}

// Tüm bildirimleri okundu işaretleme
async function markAllBildirimlerOkundu() {
  const query = `
    UPDATE bildirimler 
    SET okundu = 1, okunma_tarihi = NOW()
    WHERE okundu = 0 AND aktif = 1
  `;
  return await runQuery(query);
}

// Bildirim silme (soft delete)
async function deleteBildirim(bildirimId) {
  const query = `
    UPDATE bildirimler 
    SET aktif = 0
    WHERE id = ?
  `;
  return await runQuery(query, [bildirimId]);
}

// Toplu bildirim silme
async function deleteBildirimlerByIds(bildirimIds) {
  if (!bildirimIds || bildirimIds.length === 0) return { error: 'ID listesi boş' };
  
  const placeholders = bildirimIds.map(() => '?').join(',');
  const query = `
    UPDATE bildirimler 
    SET aktif = 0
    WHERE id IN (${placeholders})
  `;
  return await runQuery(query, bildirimIds);
}

// --------------------
// OTOMATİK BİLDİRİM OLUŞTURMA FONKSİYONLARI
// --------------------

// 1. Kimlik süresi kontrol ve bildirim oluşturma
async function checkAndCreateKimlikSuresiBildirimleri() {
  console.log('🆔 Kimlik süresi kontrolleri başlatılıyor...');
  
  const query = `
    SELECT 
      o.id, o.ogr_ad, o.ogr_soyad, o.ogr_TC, o.ogr_ceptel, o.ogr_mail,
      o.ogr_turu, o.ogr_silah_durum, o.ogr_sinav_puan_tarih, o.ogr_sinav_puan,
      d.donem_numara, d.donem_turu, d.donem_baslangic_t,
      DATE_ADD(o.ogr_sinav_puan_tarih, INTERVAL 5 YEAR) as kimlik_bitis_tarihi,
      DATEDIFF(DATE_ADD(o.ogr_sinav_puan_tarih, INTERVAL 5 YEAR), CURDATE()) as kalan_gun
    FROM ogrenciler o
    LEFT JOIN donemler d ON o.ogr_donem = d.id  
    WHERE o.ogr_sinav_puan >= 60 
      AND o.ogr_sinav_puan_tarih IS NOT NULL
      AND DATE_ADD(o.ogr_sinav_puan_tarih, INTERVAL 4 YEAR) <= CURDATE()
      AND DATE_ADD(o.ogr_sinav_puan_tarih, INTERVAL 5 YEAR) >= CURDATE()
  `;
  
  const ogrenciler = await runQuery(query);
  let oluşturulan = 0;
  
  for (const ogrenci of ogrenciler) {
    const baslik = `🔵 Kimlik Süresi Uyarısı: ${ogrenci.ogr_ad} ${ogrenci.ogr_soyad}`;
    const mesaj = `
👤 ÖĞRENCİ BİLGİLERİ:
• Ad Soyad: ${ogrenci.ogr_ad} ${ogrenci.ogr_soyad}
• TC: ${ogrenci.ogr_TC}
• Telefon: ${ogrenci.ogr_ceptel || 'Belirtilmemiş'}
• E-posta: ${ogrenci.ogr_mail || 'Belirtilmemiş'}

🎓 EĞİTİM BİLGİLERİ:
• Mezun Olduğu Dönem: ${ogrenci.donem_numara} (${ogrenci.donem_turu})
• Eğitim Tipi: ${ogrenci.ogr_silah_durum || 'Belirtilmemiş'}
• Kurs Türü: ${ogrenci.ogr_turu || 'Belirtilmemiş'}
• Sınav Tarihi: ${formatDateTurkish(ogrenci.ogr_sinav_puan_tarih)}
• Sınav Notu: ${ogrenci.ogr_sinav_puan} (GEÇTİ)

⏰ SÜRE BİLGİLERİ:
• Kimlik Bitiş Tarihi: ${formatDateTurkish(ogrenci.kimlik_bitis_tarihi)}
• Kalan Süre: ${ogrenci.kalan_gun} gün
• Durum: 1 yıl içinde yenilemesi gerekiyor

📞 EYLEM GEREKLİ: Öğrenci ile iletişime geçip yenileme süreci hakkında bilgilendirin.`;

    const bildirimData = {
      baslik: baslik,
      mesaj: mesaj,
      turu: 'kimlik_suresi',
      oncelik: 'bilgi',
      ogr_id: ogrenci.id,
      donem_id: ogrenci.donem_id,
      sinav_puan_tarihi: ogrenci.ogr_sinav_puan_tarih,
      hedef_tarih: ogrenci.kimlik_bitis_tarihi
    };

    const result = await addBildirim(bildirimData);
    if (!result.error) {
      oluşturulan++;
      console.log(`✅ Kimlik süresi bildirimi oluşturuldu: ${ogrenci.ogr_ad} ${ogrenci.ogr_soyad}`);
    }
  }
  
  console.log(`🆔 Kimlik süresi kontrolleri tamamlandı. ${oluşturulan} bildirim oluşturuldu.`);
  return oluşturulan;
}

// 2. Belge eksiklikleri kontrol (dönem başlangıcından 3 gün önce)
async function checkAndCreateBelgeBildirimleri() {
  console.log('📋 Belge eksiklikleri kontrolleri başlatılıyor...');
  
  // 3 gün içinde başlayacak dönemleri bul
  const donemQuery = `
    SELECT id, donem_numara, donem_turu, donem_baslangic_t
    FROM donemler 
    WHERE DATEDIFF(donem_baslangic_t, CURDATE()) = 3
      AND donem_durum = 'Aktif'
  `;
  
  const donemler = await runQuery(donemQuery);
  let oluşturulan = 0;
  
  for (const donem of donemler) {
    // Bu dönemdeki belgesi eksik öğrencileri bul
    const ogrenciQuery = `
      SELECT id, ogr_ad, ogr_soyad, ogr_TC, ogr_ceptel,
        ogr_gerek_foto, ogr_gerek_diploma, ogr_gerek_kimlik,
        ogr_gerek_yakakarti, ogr_gerek_saglik, ogr_gerek_ikamet
      FROM ogrenciler 
      WHERE ogr_donem = ?
        AND (ogr_gerek_foto = 0 OR ogr_gerek_diploma = 0 OR 
             ogr_gerek_kimlik = 0 OR ogr_gerek_yakakarti = 0 OR 
             ogr_gerek_saglik = 0 OR ogr_gerek_ikamet = 0)
        AND ogr_durum = 'Aktif'
    `;
    
    const ogrenciler = await runQuery(ogrenciQuery, [donem.id]);
    
    if (ogrenciler.length > 0) {
      const eksikOgrenciListesi = ogrenciler.map(o => {
        const eksikBelgeler = [];
        if (o.ogr_gerek_foto === 0) eksikBelgeler.push('Fotoğraf');
        if (o.ogr_gerek_diploma === 0) eksikBelgeler.push('Diploma');
        if (o.ogr_gerek_kimlik === 0) eksikBelgeler.push('Kimlik');
        if (o.ogr_gerek_yakakarti === 0) eksikBelgeler.push('Yaka Kartı');
        if (o.ogr_gerek_saglik === 0) eksikBelgeler.push('Sağlık Raporu');
        if (o.ogr_gerek_ikamet === 0) eksikBelgeler.push('İkamet Belgesi');
        
        return `• ${o.ogr_ad} ${o.ogr_soyad} (${o.ogr_TC})\n  Tel: ${o.ogr_ceptel || 'Yok'}\n  Eksikler: ${eksikBelgeler.join(', ')}`;
      }).join('\n\n');

      const baslik = `🟡 Belge Eksiklikleri: ${ogrenciler.length} Öğrenci - Dönem ${donem.donem_numara}`;
      const mesaj = `
📋 DÖNEM BİLGİLERİ:
• Dönem: ${donem.donem_numara} (${donem.donem_turu})
• Başlangıç: ${formatDateTurkish(donem.donem_baslangic_t)}
• Kalan Süre: 3 gün

👥 BELGESİ EKSİK ÖĞRENCİLER (${ogrenciler.length} kişi):

${eksikOgrenciListesi}

📞 EYLEM GEREKLİ: Bu öğrencilerle iletişime geçerek eksik belgelerini tamamlamalarını sağlayın.`;

      const bildirimData = {
        baslik: baslik,
        mesaj: mesaj,
        turu: 'belge',
        oncelik: 'onemli',
        donem_id: donem.id,
        hedef_tarih: donem.donem_baslangic_t
      };

      const result = await addBildirim(bildirimData);
      if (!result.error) {
        oluşturulan++;
        console.log(`✅ Belge eksikliği bildirimi oluşturuldu: Dönem ${donem.donem_numara}`);
      }
    }
  }
  
  console.log(`📋 Belge kontrolleri tamamlandı. ${oluşturulan} bildirim oluşturuldu.`);
  return oluşturulan;
}

// 3. Ödeme eksiklikleri kontrol (dönem bitiş günü)
async function checkAndCreateOdemeBildirimleri() {
  console.log('💰 Ödeme eksiklikleri kontrolleri başlatılıyor...');
  
  // Bugün biten dönemleri bul
  const donemQuery = `
    SELECT id, donem_numara, donem_turu, donem_bitis_t
    FROM donemler 
    WHERE DATE(donem_bitis_t) = CURDATE()
      AND donem_durum = 'Aktif'
  `;
  
  const donemler = await runQuery(donemQuery);
  let oluşturulan = 0;
  
  for (const donem of donemler) {
    // Bu dönemdeki ödemesi eksik öğrencileri bul
    const ogrenciQuery = `
      SELECT 
        o.id, o.ogr_ad, o.ogr_soyad, o.ogr_TC, o.ogr_ceptel, o.ogr_odeme,
        COALESCE(SUM(od.odenen_tutar), 0) as toplam_odenen,
        (o.ogr_odeme - COALESCE(SUM(od.odenen_tutar), 0)) as kalan_borc
      FROM ogrenciler o
      LEFT JOIN odemeler od ON o.id = od.ogr_id
      WHERE o.ogr_donem = ?
        AND o.ogr_durum = 'Aktif'
        AND o.ogr_odeme > 0
      GROUP BY o.id
      HAVING kalan_borc > 0
    `;
    
    const ogrenciler = await runQuery(ogrenciQuery, [donem.id]);
    
    if (ogrenciler.length > 0) {
      const toplamBorc = ogrenciler.reduce((sum, o) => sum + parseFloat(o.kalan_borc), 0);
      
      const ogrenciListesi = ogrenciler.map(o => 
        `• ${o.ogr_ad} ${o.ogr_soyad} (${o.ogr_TC})\n  Tel: ${o.ogr_ceptel || 'Yok'}\n  Kalan Borç: ₺${parseFloat(o.kalan_borc).toLocaleString('tr-TR')}`
      ).join('\n\n');

      const baslik = `🔴 Ödeme Eksiklikleri: ${ogrenciler.length} Öğrenci - Dönem ${donem.donem_numara}`;
      const mesaj = `
💰 DÖNEM BİLGİLERİ:
• Dönem: ${donem.donem_numara} (${donem.donem_turu})
• Bitiş Tarihi: ${formatDateTurkish(donem.donem_bitis_t)}
• Durum: BUGÜN BİTİYOR!

💳 ÖDEME EKSİKLİKLERİ:
• Borcu Olan Öğrenci: ${ogrenciler.length} kişi
• Toplam Borç: ₺${toplamBorc.toLocaleString('tr-TR')}

👥 ÖDEMESİ EKSİK ÖĞRENCİLER:

${ogrenciListesi}

📞 ACİL EYLEM: Bu öğrencilerle derhal iletişime geçerek ödeme durumlarını takip edin!`;

      const bildirimData = {
        baslik: baslik,
        mesaj: mesaj,
        turu: 'odeme',
        oncelik: 'acil',
        donem_id: donem.id,
        hedef_tarih: donem.donem_bitis_t
      };

      const result = await addBildirim(bildirimData);
      if (!result.error) {
        oluşturulan++;
        console.log(`✅ Ödeme eksikliği bildirimi oluşturuldu: Dönem ${donem.donem_numara}`);
      }
    }
  }
  
  console.log(`💰 Ödeme kontrolleri tamamlandı. ${oluşturulan} bildirim oluşturuldu.`);
  return oluşturulan;
}

// 4. Dönem bildirimleri (başlangıç/bitiş)
async function checkAndCreateDonemBildirimleri() {
  console.log('📚 Dönem bildirimleri kontrolleri başlatılıyor...');
  
  let oluşturulan = 0;
  
  // Yarın başlayan dönemler
  const baslangicQuery = `
    SELECT id, donem_numara, donem_turu, donem_baslangic_t, donem_ogr_adedi
    FROM donemler 
    WHERE DATE(donem_baslangic_t) = DATE_ADD(CURDATE(), INTERVAL 1 DAY)
      AND donem_durum = 'Aktif'
  `;
  
  const baslangicDonemler = await runQuery(baslangicQuery);
  
  for (const donem of baslangicDonemler) {
    const baslik = `🟢 Dönem Başlangıcı: ${donem.donem_numara}`;
    const mesaj = `
📚 DÖNEM BİLGİLERİ:
• Dönem: ${donem.donem_numara}
• Tür: ${donem.donem_turu}
• Başlangıç: ${formatDateTurkish(donem.donem_baslangic_t)}
• Öğrenci Sayısı: ${donem.donem_ogr_adedi || 0} kişi

🎯 DURUM: Dönem yarın başlıyor!

📋 KONTROL LİSTESİ:
• Tüm öğrenci belgeleri kontrol edildi mi?
• Sınıf ve eğitim materyalleri hazır mı?
• Eğitmenler bilgilendirildi mi?

✅ EYLEM: Son kontrolleri yapın ve eğitime hazır olun!`;

    const bildirimData = {
      baslik: baslik,
      mesaj: mesaj,
      turu: 'egitim',
      oncelik: 'onemli',
      donem_id: donem.id,
      hedef_tarih: donem.donem_baslangic_t
    };

    const result = await addBildirim(bildirimData);
    if (!result.error) {
      oluşturulan++;
      console.log(`✅ Dönem başlangıç bildirimi oluşturuldu: ${donem.donem_numara}`);
    }
  }
  
  // Yarın biten dönemler
  const bitisQuery = `
    SELECT id, donem_numara, donem_turu, donem_bitis_t, donem_ogr_adedi
    FROM donemler 
    WHERE DATE(donem_bitis_t) = DATE_ADD(CURDATE(), INTERVAL 1 DAY)
      AND donem_durum = 'Aktif'
  `;
  
  const bitisDonemler = await runQuery(bitisQuery);
  
  for (const donem of bitisDonemler) {
    const baslik = `🔴 Dönem Bitiş Uyarısı: ${donem.donem_numara}`;
    const mesaj = `
📚 DÖNEM BİLGİLERİ:
• Dönem: ${donem.donem_numara}
• Tür: ${donem.donem_turu}
• Bitiş: ${formatDateTurkish(donem.donem_bitis_t)}
• Öğrenci Sayısı: ${donem.donem_ogr_adedi || 0} kişi

⏰ DURUM: Dönem yarın bitiyor!

📋 SON KONTROLLER:
• Tüm ödemeler kontrol edildi mi?
• Sınav sonuçları girildi mi?
• Belgeler tamamlandı mı?
• Mezuniyet işlemleri hazır mı?

🎯 EYLEM: Dönem kapanış işlemlerini tamamlayın!`;

    const bildirimData = {
      baslik: baslik,
      mesaj: mesaj,
      turu: 'egitim',
      oncelik: 'onemli',
      donem_id: donem.id,
      hedef_tarih: donem.donem_bitis_t
    };

    const result = await addBildirim(bildirimData);
    if (!result.error) {
      oluşturulan++;
      console.log(`✅ Dönem bitiş bildirimi oluşturuldu: ${donem.donem_numara}`);
    }
  }
  
  console.log(`📚 Dönem kontrolleri tamamlandı. ${oluşturulan} bildirim oluşturuldu.`);
  return oluşturulan;
}

// Ana otomatik kontrol fonksiyonu - günlük çalıştırılacak
async function runDailyNotificationChecks() {
  console.log('🤖 Günlük bildirim kontrolleri başlatılıyor...', new Date().toLocaleString('tr-TR'));
  
  const sonuclar = {
    kimlik_suresi: 0,
    belge: 0,
    odeme: 0,
    egitim: 0,
    toplam: 0,
    hata: null
  };
  
  try {
    // 1. Kimlik süresi kontrolleri
    sonuclar.kimlik_suresi = await checkAndCreateKimlikSuresiBildirimleri();
    
    // 2. Belge eksiklikleri kontrolleri  
    sonuclar.belge = await checkAndCreateBelgeBildirimleri();
    
    // 3. Ödeme eksiklikleri kontrolleri
    sonuclar.odeme = await checkAndCreateOdemeBildirimleri();
    
    // 4. Dönem bildirimleri kontrolleri
    sonuclar.egitim = await checkAndCreateDonemBildirimleri();
    
    // Toplam hesapla
    sonuclar.toplam = sonuclar.kimlik_suresi + sonuclar.belge + sonuclar.odeme + sonuclar.egitim;
    
    console.log('✅ Günlük bildirim kontrolleri tamamlandı:', sonuclar);
    return sonuclar;
    
  } catch (error) {
    console.error('❌ Günlük bildirim kontrolleri sırasında hata:', error);
    sonuclar.hata = error.message;
    return sonuclar;
  }
}

// Manuel bildirim kontrol tetikleyicisi
async function manualNotificationCheck() {
  console.log('🔄 Manuel bildirim kontrolü başlatılıyor...');
  return await runDailyNotificationChecks();
}

// Otomatik zamanlayıcı kurulum (isteğe bağlı)
function setupDailyNotificationScheduler() {
  const now = new Date();
  const midnight = new Date();
  midnight.setHours(24, 1, 0, 0); // Gece 00:01
  
  const msUntilMidnight = midnight.getTime() - now.getTime();
  
  // İlk çalışma: gece yarısından sonra
  setTimeout(() => {
    runDailyNotificationChecks();
    
    // Sonrasında her 24 saatte bir
    setInterval(() => {
      runDailyNotificationChecks();
    }, 24 * 60 * 60 * 1000); // 24 saat
    
  }, msUntilMidnight);
  
  console.log('⏰ Günlük bildirim kontrolü zamanlayıcısı kuruldu');
}

// =============================================================================
// IPC HANDLER'LARI - main.js'teki app.whenReady() içine eklenecek
// =============================================================================

// Mevcut app.whenReady().then(() => { ... }) içindeki ipcMain.handle'ların sonuna ekleyin:

// Bildirimler
ipcMain.handle('getBildirimler', async () => {
  return await getBildirimler();
});

ipcMain.handle('getBildirimlerByTur', async (event, tur) => {
  return await getBildirimlerByTur(tur);
});

ipcMain.handle('getOkunmamisBildirimler', async () => {
  return await getOkunmamisBildirimler();
});

ipcMain.handle('getBildirimStats', async () => {
  return await getBildirimStats();
});

ipcMain.handle('addBildirim', async (event, bildirimData) => {
  return await addBildirim(bildirimData);
});

ipcMain.handle('markBildirimOkundu', async (event, bildirimId) => {
  return await markBildirimOkundu(bildirimId);
});

ipcMain.handle('markAllBildirimlerOkundu', async () => {
  return await markAllBildirimlerOkundu();
});

ipcMain.handle('deleteBildirim', async (event, bildirimId) => {
  return await deleteBildirim(bildirimId);
});

ipcMain.handle('deleteBildirimlerByIds', async (event, bildirimIds) => {
  return await deleteBildirimlerByIds(bildirimIds);
});

// Otomatik bildirim kontrolleri
ipcMain.handle('runDailyNotificationChecks', async () => {
  return await runDailyNotificationChecks();
});

ipcMain.handle('manualNotificationCheck', async () => {
  return await manualNotificationCheck();
});

ipcMain.handle('checkAndCreateKimlikSuresiBildirimleri', async () => {
  return await checkAndCreateKimlikSuresiBildirimleri();
});

ipcMain.handle('checkAndCreateBelgeBildirimleri', async () => {
  return await checkAndCreateBelgeBildirimleri();
});

ipcMain.handle('checkAndCreateOdemeBildirimleri', async () => {
  return await checkAndCreateOdemeBildirimleri();
});

ipcMain.handle('checkAndCreateDonemBildirimleri', async () => {
  return await checkAndCreateDonemBildirimleri();
});