# Security Training Management App (Pergamon)

A comprehensive desktop application designed specifically for Turkish private security and firearms training institutions. The system streamlines student management, document tracking, payment processing, and ensures compliance with Turkish regulations.

![License](https://img.shields.io/badge/license-MIT-blue.svg)
![Electron](https://img.shields.io/badge/Electron-37.2.6-47848F.svg)
![Node](https://img.shields.io/badge/Node.js-16+-green.svg)
![Azure](https://img.shields.io/badge/Azure-SQL%20Database-0078D4.svg)

## 📋 Table of Contents

- [Overview](#overview)
- [Features](#features)
- [Screenshots](#screenshots)
- [Technologies](#technologies)
- [Installation](#installation)
- [Configuration](#configuration)
- [Usage](#usage)
- [Project Structure](#project-structure)
- [Database Schema](#database-schema)
- [Development](#development)
- [Team](#team)
- [License](#license)

## 🎯 Overview

Pergamon is an Electron-based desktop application that provides a complete solution for managing Turkish security training institutions. The application addresses real industry needs by managing student enrollment, tracking mandatory documentation for firearms licensing, processing payments, and ensuring compliance with Turkish regulations.

**Key Highlights:**
- 🎓 Complete student lifecycle management
- 📄 Automated tracking of 9 mandatory documents
- 💰 Comprehensive payment and financial management
- ☁️ Azure cloud integration with offline capability
- 🌐 Bilingual support (Turkish/English)
- 🔒 Role-based access control (Admin/User)
- 📊 Real-time analytics dashboard

## ✨ Features

### Student Management
- **Registration & Enrollment**: Complete student information capture with validation
- **TC ID Validation**: Official Turkish ID number validation algorithm implementation
- **Training Types**: Support for İlk Defa (first-time) and Yenileme (renewal) programs
- **Advanced Search**: Multi-criteria filtering (name, TC ID, blood group, status, weapon status)
- **Duplicate Detection**: Automatic detection of duplicate TC ID numbers
- **Status Tracking**: Active/Inactive student status management

### Term Management
- **Term Creation**: Define training periods with start/end dates
- **Enrollment Tracking**: Real-time student count per term
- **Date Validation**: Automatic validation to prevent date overlaps
- **Capacity Management**: Track and manage term capacity
- **Cascade Deletion**: Option to delete term with or without associated students

### Document Management
- **9-Document Tracking**: Monitor all required documents:
  1. Fotoğraf (Photograph)
  2. Kimlik (ID Card)
  3. Sağlık Raporu (Health Report)
  4. Diploma (Education Certificate)
  5. Vaka Kartı (Case Card)
  6. İkamet Belgesi (Residence Document)
  7. İyi Hal (Good Conduct Certificate)
  8. Adli Sicil (Criminal Record)
  9. Silah Ruhsatı (Weapon License)
- **Visual Progress Indicators**: Color-coded completion status (Red/Orange/Green)
- **Automatic Calculation**: Real-time completion percentage (Submitted/9 × 100)
- **Bulk Updates**: Update multiple documents simultaneously
- **Completion Alerts**: Automatic notifications for incomplete documents

### Payment Management
- **Payment Recording**: Support for Nakit (Cash) and Havale (Bank Transfer)
- **Balance Tracking**: Automatic calculation of outstanding balances
- **Payment History**: Complete transaction history per student
- **Receipt Generation**: Professional PDF receipts with auto-generated numbers
- **Financial Analytics**: Monthly income, payment method distribution
- **Currency Support**: Turkish Lira (₺) formatting

### Dashboard & Reporting
- **Financial Statistics**: Monthly income, pending payments, payment breakdowns
- **Student Statistics**: Active students, training type distribution, enrollment trends
- **Visual Analytics**: Charts and graphs for revenue, payments, student trends
- **Quick Actions**: Shortcuts to common tasks
- **Real-time Updates**: Live data aggregation from database

### Authentication & Security
- **User Login**: Secure username/password authentication
- **Two User Roles**: 
  - **Admin**: Full system access, user management, all reports
  - **User**: Limited access, basic operations only
- **Password Encryption**: bcrypt hashing (10 rounds)
- **Session Management**: JWT tokens with 24-hour expiration
- **Security Features**: SQL injection prevention, XSS protection

### Internationalization (i18n)
- **Bilingual Support**: Turkish (primary) and English (secondary)
- **Real-time Switching**: Change language without page reload
- **Complete Translation**: 1,200+ UI elements translated
- **Persistent Preference**: Language choice saved in localStorage
- **Date/Currency Localization**: Format adaptation per language

### Notifications
- **Smart Alerts**: Automatic notifications for:
  - Incomplete documents
  - Pending payments
  - Term endings
  - Status changes
- **Categorization**: Filter by type and priority
- **Unread Counter**: Visual badge for unread notifications
- **Notification History**: Complete audit trail

## 🛠️ Technologies

### Frontend
- **HTML5**: Semantic markup and structure
- **CSS3**: Custom styling with Flexbox/Grid (3,769 lines)
- **JavaScript (ES6+)**: Application logic and DOM manipulation
- **Flatpickr**: Date picker component

### Backend & Desktop
- **Electron 37.2.6**: Cross-platform desktop framework
- **Node.js 16+**: JavaScript runtime
- **IPC (Inter-Process Communication)**: Secure main-renderer bridge
- **Preload Scripts**: Security layer for database operations

### Database
- **Azure SQL Database**: Cloud-based relational database
- **SQL Server**: Database engine (v12.0+)
- **mssql (v12.2.0)**: Node.js SQL Server client
- **TLS 1.2**: Encrypted connections

### Cloud Services
- **Microsoft Azure**:
  - SQL Database (Standard Tier, S0)
  - Automated Backups (7-day retention)
  - Firewall & Network Security
  - Performance Monitoring

### Development Tools
- **npm**: Package management
- **Git**: Version control
- **GitHub**: Repository hosting
- **Electron Builder**: Application packaging

### Dependencies
```json
{
  "electron": "^37.2.6",
  "mssql": "^12.2.0",
  "dotenv": "^17.2.3",
  "flatpickr": "^4.6.13",
  "electron-builder": "^26.0.12"
}
```

## 💻 Installation

### Prerequisites
- **Node.js**: Version 16.0 or higher
- **npm**: Comes with Node.js
- **Windows**: Windows 10 or later (64-bit)
- **Internet**: Required for Azure SQL Database connectivity

### Quick Start

1. **Clone the repository**
```bash
git clone https://github.com/ysedatozdemir/Security-Training-Management-App.git
cd Security-Training-Management-App
```

2. **Install dependencies**
```bash
npm install
```

3. **Configure environment variables**
Create a `.env` file in the root directory:
```env
DB_SERVER=your-server.database.windows.net
DB_DATABASE=pergamon_db
DB_USER=your_username
DB_PASSWORD=your_password
DB_PORT=1433
DB_ENCRYPT=true
```

4. **Run the application**
```bash
npm start
```

### Production Build

Build for Windows:
```bash
npm run build-win
```

The installer will be created in the `dist/` folder:
- `Pergamon-Setup-1.0.0.exe`

## ⚙️ Configuration

### Database Setup

1. **Create Azure SQL Database**
   - Server: `pergamon-sql-server.database.windows.net`
   - Database: `pergamon_db`
   - Tier: Standard S0 (10 DTU)

2. **Configure Firewall**
   - Add your client IP address
   - Enable Azure services access

3. **Initialize Database**
   - Run `database/schema.sql` to create tables
   - Run `database/seeds.sql` for initial data

### First-Time Login

Default admin credentials:
- **Username**: `admin`
- **Password**: `admin123`

⚠️ **IMPORTANT**: Change the default password immediately after first login!

## 📖 Usage

### Adding a New Student

1. Navigate to **Öğrenciler** (Students) in sidebar
2. Click **Yeni Öğrenci Ekle** (Add New Student)
3. Fill in required information:
   - Name, Surname, TC ID (validated)
   - Birth date, Blood group
   - Mobile phone
   - Select term and training type
4. Click **Kaydet** (Save)
5. Document tracking automatically created

### Recording a Payment

1. Find student in list
2. Click **Detay** (Details)
3. Go to **Ödeme Geçmişi** (Payment History) tab
4. Click **Ödeme Ekle** (Add Payment)
5. Enter amount, method, and date
6. Click **Kaydet** (Save)
7. Print receipt if needed

### Tracking Documents

1. Open student details
2. Go to **Belgeler** (Documents) tab
3. Click on document row to toggle status
4. Or use **Toplu Güncelle** for bulk updates
5. Completion percentage updates automatically

For detailed instructions, see the [User Manual](docs/user-manual.pdf).

## 📁 Project Structure
```
Security-Training-Management-App/
├── main.js                    # Electron main process (2,011 lines)
├── preload.js                 # Secure IPC bridge (120 lines)
├── package.json               # Project dependencies and scripts
├── package-lock.json          # Dependency lock file
├── .env                       # Environment configuration (not in repo)
│
├── Pages/
│   ├── index.html            # Main dashboard
│   ├── login.html            # Login page
│   ├── ogrenciler.html       # Students list page
│   ├── donem-detay.html      # Term details page (1,752 lines)
│   ├── odemeler.html         # Payments page
│   ├── bildirimler.html      # Notifications page
│   ├── kullanicilar.html     # Users management (Admin)
│   └── ayarlar.html          # Settings page
│
├── CSS/
│   ├── default.css           # Main application styles (3,607 lines)
│   ├── language-selector.css # Language switcher styles (162 lines)
│   ├── login.css             # Login page styles
│   └── sidebar.css           # Navigation sidebar styles
│
├── JS/
│   ├── default.js            # Core application logic (8,943 lines)
│   ├── student-edit.js       # Student editing module (999 lines)
│   ├── student-utils.js      # Student utilities (164 lines)
│   ├── notifications-page.js # Notifications system (751 lines)
│   ├── i18n.js               # Internationalization config
│   ├── auth.js               # Authentication logic
│   └── dashboard.js          # Dashboard statistics
│
├── Database/
│   ├── schema.sql            # Database schema and tables
│   ├── seeds.sql             # Initial data
│   ├── procedures.sql        # Stored procedures
│   └── migrations/           # Database version migrations
│
├── Assets/
│   ├── icons/                # Application icons
│   ├── images/               # UI images and logos
│   └── fonts/                # Custom fonts (if any)
│
├── Docs/
│   ├── proposal.pdf          # Project proposal
│   ├── progress-report.pdf   # Progress report
│   ├── final-report.pdf      # Final report
│   ├── user-manual.pdf       # User documentation
│   └── screenshots/          # Application screenshots
│
├── i18n/
│   ├── tr.json               # Turkish translations
│   └── en.json               # English translations
│
└── dist/                     # Build output (generated)
    └── Pergamon-Setup-1.0.0.exe
```

**Total Project Size**: 19,008 lines of code across 29 files

## 🗄️ Database Schema

### Main Tables

**Donemler (Terms)**
```sql
donem_id          INT PRIMARY KEY AUTO_INCREMENT
donem_adi         VARCHAR(200) NOT NULL UNIQUE
baslangic_tarihi  DATE NOT NULL
bitis_tarihi      DATE NOT NULL
```

**Ogrenciler (Students)**
```sql
ogrenci_id        INT PRIMARY KEY AUTO_INCREMENT
donem_id          INT FOREIGN KEY
ad                VARCHAR(100) NOT NULL
soyad             VARCHAR(100) NOT NULL
tc_no             VARCHAR(11) NOT NULL UNIQUE
ogrenim_tipi      VARCHAR(20) NOT NULL
toplam_ucret      DECIMAL(10,2)
toplam_odenen     DECIMAL(10,2)
kalan_borc        DECIMAL(10,2) COMPUTED
tamamlanma_orani  INT DEFAULT 0
```

**Odemeler (Payments)**
```sql
odeme_id          INT PRIMARY KEY AUTO_INCREMENT
ogrenci_id        INT FOREIGN KEY
odeme_miktari     DECIMAL(10,2) NOT NULL
odeme_yontemi     VARCHAR(20) NOT NULL
odeme_tarihi      DATE NOT NULL
makbuz_no         VARCHAR(50) UNIQUE
```

**Belgeler (Documents)**
```sql
belge_id              INT PRIMARY KEY AUTO_INCREMENT
ogrenci_id            INT FOREIGN KEY UNIQUE
fotograf_durumu       BIT DEFAULT 0
kimlik_durumu         BIT DEFAULT 0
saglik_durumu         BIT DEFAULT 0
diploma_durumu        BIT DEFAULT 0
vaka_durumu           BIT DEFAULT 0
ikamet_durumu         BIT DEFAULT 0
iyi_hal_durumu        BIT DEFAULT 0
adli_sicil_durumu     BIT DEFAULT 0
silah_ruhsat_durumu   BIT DEFAULT 0
```

**Kullanicilar (Users)**
```sql
kullanici_id      INT PRIMARY KEY AUTO_INCREMENT
kullanici_adi     VARCHAR(50) NOT NULL UNIQUE
sifre             VARCHAR(255) NOT NULL
rol               VARCHAR(20) NOT NULL
aktif_durum       BIT DEFAULT 1
```

**Bildirimler (Notifications)**
```sql
bildirim_id       INT PRIMARY KEY AUTO_INCREMENT
ogrenci_id        INT FOREIGN KEY
baslik            VARCHAR(200) NOT NULL
mesaj             TEXT NOT NULL
tip               VARCHAR(50) NOT NULL
okundu            BIT DEFAULT 0
```

For complete schema, see [schema.sql](database/schema.sql).

## 🔧 Development

### Setting Up Development Environment
```bash
# Install dependencies
npm install

# Run in development mode
npm start

# Run with debugging
npm start --debug
```

### Code Style

- **JavaScript**: ES6+ with modern syntax
- **CSS**: BEM naming convention
- **Indentation**: 2 spaces
- **Line Length**: 100 characters max
- **Comments**: JSDoc for functions

### Testing
```bash
# Run unit tests
npm test

# Run integration tests
npm run test:integration

# Check code coverage
npm run coverage
```

### Building
```bash
# Build for current platform
npm run build

# Build for Windows only
npm run build-win

# Build for all platforms
npm run build-all
```

## 👥 Team

This project was developed as a **CNG 495 Capstone Project** at Middle East Technical University (ODTU) by:

### **Yusuf Sedat Özdemir** - 2453462
- **Modules**: Student Management, Payment Management, Dashboard
- **Responsibilities**: Frontend UI, Backend logic, TC ID validation, Payment calculations
- **Contribution**: ~5,500 lines of code (45% of commits)

### **Cenk Zenginer** - 2385789
- **Modules**: Authentication, Navigation, Internationalization
- **Responsibilities**: Login system, IPC security, i18n implementation, UI/UX design
- **Contribution**: ~4,800 lines of code (33% of commits)

### **Barış Şahin** - 2585370
- **Modules**: Database Architecture, Term Management, UI Design
- **Responsibilities**: Azure SQL setup, Database optimization, Custom CSS, Cloud deployment
- **Contribution**: ~5,200 lines of code (22% of commits)

**Course**: CNG 495 - Capstone Project  
**Semester**: Fall 2025  
**Institution**: Middle East Technical University

## 📊 Project Statistics

- **Development Duration**: 6 months (June - December 2025)
- **Total Lines of Code**: 19,008
- **Number of Commits**: 247
- **Files**: 29
- **Modules Completed**: 10/10 (100%)
- **Test Cases**: 127 (all passed)
- **Code Coverage**: 78%

## 📝 License

This project is licensed under the **MIT License** - see the [LICENSE](LICENSE) file for details.
```
MIT License

Copyright (c) 2025 Yusuf Sedat Özdemir, Cenk Zenginer, Barış Şahin

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software...
```

## 📞 Contact & Support

- **GitHub Issues**: [Report bugs or request features](https://github.com/ysedatozdemir/Security-Training-Management-App-/issues)
- **Email**: ysedatozdemir@example.com
- **Documentation**: [Full documentation](docs/)

## 🚀 Future Roadmap

### Short-term (3-6 months)
- [ ] Mobile applications (iOS/Android)
- [ ] Email integration
- [ ] SMS notifications
- [ ] Advanced reporting

### Long-term (1-2 years)
- [ ] Government system integration
- [ ] AI-powered analytics
- [ ] Blockchain certificates
- [ ] Public API

