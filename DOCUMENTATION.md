# Simple Order/Inquiry Website - Documentation

## 📋 Overview

This is a lightweight, secure PHP landing page with an inquiry form. Users can submit inquiries which are stored in a MySQL database. The application is containerized with Docker for easy deployment.

**Tech Stack:**
- PHP 8.2 (Apache)
- MySQL 8.0
- Docker Compose
- Tailwind CSS (via CDN)

---

## 🚀 Quick Start

### Prerequisites
- Docker & Docker Compose installed
- Windows PowerShell or terminal

### Setup Steps

1. **Clone/navigate to project root:**
   ```powershell
   cd C:\Users\decha\Desktop\Project
   ```

2. **Create `.env` file with your credentials:**
   ```env
   MYSQL_ROOT_PASSWORD=rootpassword
   MYSQL_DATABASE=mydb
   MYSQL_USER=user
   MYSQL_PASSWORD=password
   APP_DEBUG=false
   ```

3. **Pre-pull images (optional but recommended):**
   ```powershell
   docker pull php:8.2-apache
   docker pull mysql:8.0
   docker pull phpmyadmin/phpmyadmin
   ```

4. **Start the stack:**
   ```powershell
   docker-compose up -d --build
   ```

5. **Create the database table:**
   ```powershell
   docker exec db mysql -u root -prootpassword -e "
   CREATE TABLE IF NOT EXISTS inquiries (
       id INT AUTO_INCREMENT PRIMARY KEY,
       name VARCHAR(100) NOT NULL,
       email VARCHAR(255) NOT NULL,
       message TEXT NOT NULL,
       ip_address VARCHAR(45),
       status ENUM('new','read','replied') DEFAULT 'new',
       created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
   );
   "
   ```

6. **Access the application:**
   - Landing Page: http://localhost:8080
   - PhpMyAdmin: http://localhost:8081 (user: `root`, password: your `MYSQL_ROOT_PASSWORD`)

---

## 📁 Project Structure

```
Project/
├── src/
│   └── index.php              # Main landing page & form handler
├── docker-compose.yml         # Container orchestration
├── Dockerfile                 # PHP image customization
├── .env                       # Environment variables (create manually)
├── backup.sql                 # Database backup (created manually)
├── README.md                  # This file
├── TODO.md                    # Future enhancements
└── DOCUMENTATION.md           # Detailed tech docs
```

---

## 🔐 Security Features

### Implemented
- ✅ **CSRF Protection** – Token-based form validation
- ✅ **SQL Injection Prevention** – Prepared statements with named placeholders
- ✅ **XSS Prevention** – All output escaped with `htmlspecialchars()`
- ✅ **Rate Limiting** – Max 5 submissions per IP per hour
- ✅ **Input Validation** – Length & format checks (100/255/5000 chars)
- ✅ **Security Headers** – X-Frame-Options, X-Content-Type-Options, etc.
- ✅ **Email Validation** – `filter_var(FILTER_VALIDATE_EMAIL)`
- ✅ **Database Credentials** – Stored in `.env`, not hardcoded
- ✅ **Error Handling** – Sensitive errors hidden in production mode
- ✅ **Session Security** – Token regeneration after successful submission

### Design Patterns
- **Prepared Statements**: All DB queries use parameterized queries
- **Graceful Degradation**: Rate limiting works without `ip_address` column (enables after adding)
- **Production Mode**: `APP_DEBUG=false` hides stack traces

---

## 🛠️ Configuration

### Environment Variables (`.env`)

```env
# Database
MYSQL_ROOT_PASSWORD=rootpassword
MYSQL_DATABASE=mydb
MYSQL_USER=user
MYSQL_PASSWORD=password

# Application
APP_DEBUG=false              # Set to 'true' only during development
```

### Customization

**Change business name:**
- Edit `<title>` tag in [src/index.php](src/index.php) (line ~130)
- Edit `.logo` text in navbar (line ~334)

**Update features section:**
- Modify the three feature boxes (lines ~406-421)

**Adjust form limits:**
- `$max_name = 100` (line 73)
- `$max_email = 255` (line 74)
- `$max_message = 5000` (line 75)

**Change rate limit:**
- Modify `check_rate_limit($pdo, $client_ip, 5)` → change `5` to desired limit per hour

---

## 📊 Database

### Table: `inquiries`

| Column | Type | Notes |
|--------|------|-------|
| `id` | INT | Auto-increment primary key |
| `name` | VARCHAR(100) | Inquirer's name |
| `email` | VARCHAR(255) | Contact email |
| `message` | TEXT | Inquiry message (max 5000 chars) |
| `ip_address` | VARCHAR(45) | Client IP for rate limiting |
| `status` | ENUM | 'new', 'read', 'replied' |
| `created_at` | TIMESTAMP | Submission time |

### Accessing Data

**PhpMyAdmin GUI:**
- Navigate to http://localhost:8081
- Login: `root` / your password
- Database: `mydb` → Table: `inquiries`

**Command Line:**
```powershell
docker exec db mysql -u user -ppassword mydb -e "SELECT * FROM inquiries;"
```

**Export/Backup:**
```powershell
docker exec db mysqldump -u root -prootpassword mydb > backup.sql
```

**Restore:**
```powershell
docker exec -i db mysql -u root -prootpassword mydb < backup.sql
```

---

## 🐳 Docker Management

### Common Commands

**Start containers:**
```powershell
docker-compose up -d
```

**View logs:**
```powershell
docker-compose logs -f web    # PHP/Apache logs
docker-compose logs -f db     # MySQL logs
```

**Stop containers (keep data):**
```powershell
docker-compose down
```

**Full reset (delete database):**
```powershell
docker-compose down -v
```

**Rebuild images:**
```powershell
docker-compose up -d --build
```

**Check container status:**
```powershell
docker ps
```

---

## 📝 Form Submission Flow

1. **User loads page** → PHP generates CSRF token, stores in session
2. **User fills form** → Client-side character counter updates
3. **User submits** → POST request sent with form data + CSRF token
4. **Server validates:**
   - ✅ CSRF token matches session token
   - ✅ All fields present
   - ✅ Lengths within limits
   - ✅ Email is valid format
   - ✅ IP hasn't exceeded rate limit
5. **Data inserted** → If validation passes, inquiry saved to DB
6. **Response:**
   - ✅ Token regenerated
   - ✅ Form hidden
   - ✅ Success message displayed
7. **Error case:**
   - ✗ Error message shown
   - ✗ Form remains visible with previous values pre-filled

---

## 🚨 Troubleshooting

**"Database connection failed"**
- Check `.env` file exists with correct credentials
- Ensure `db` container is running: `docker ps`
- Check logs: `docker-compose logs db`

**"Service temporarily unavailable"**
- Set `APP_DEBUG=true` in `.env` to see actual error
- Check PHP container: `docker-compose logs web`

**Rate limiting not working**
- `ip_address` column missing from `inquiries` table
- Run the CREATE TABLE command above
- Rate limiting gracefully degrades without column

**Form not submitting**
- Check browser console for JavaScript errors
- Verify session is enabled (should work out of box)
- Clear browser cookies and try again

**PhpMyAdmin won't connect**
- Ensure `db` service is healthy: `docker-compose logs db`
- Verify `MYSQL_ROOT_PASSWORD` in `.env`
- Wait 10 seconds for MySQL to initialize

---

## 🔄 Backup & Recovery

**Daily backup strategy:**

1. **Export database:**
   ```powershell
   $date = Get-Date -Format "yyyy-MM-dd-HHmm"
   docker exec db mysqldump -u root -prootpassword mydb > "backup-$date.sql"
   ```

2. **Store in .gitignore (don't commit passwords):**
   ```
   .env
   *.sql
   db_data/
   ```

3. **Restore from backup:**
   ```powershell
   docker-compose up -d  # Ensure DB is running
   docker exec -i db mysql -u root -prootpassword mydb < backup-2026-03-03-1000.sql
   ```

---

## 📦 Deployment Notes

### For Production Deployment:

1. **Change all default credentials** in `.env`
2. **Set `APP_DEBUG=false`**
3. **Use a reverse proxy** (Nginx) with SSL/TLS
4. **Hide PhpMyAdmin** behind authentication or remove from public docker-compose
5. **Set up automated backups** (daily or hourly)
6. **Monitor logs** for errors and abuse patterns
7. **Configure email notifications** (enhancement, not yet implemented)
8. **Use a managed database** (optional, more secure than containerized)

### SSL/HTTPS Setup:
- Use Let's Encrypt for free SSL
- Configure Nginx reverse proxy in front of Apache
- Redirect HTTP → HTTPS

### Load Balancing:
- Deploy multiple web replicas behind Nginx
- Share single MySQL database
- Use Docker Swarm or Kubernetes for orchestration

---

## 📞 Support

**For issues:**
1. Check logs: `docker-compose logs [service]`
2. Verify `.env` file exists and is correct
3. Review this documentation
4. Check TODO.md for planned improvements

---

**Last Updated:** March 3, 2026  
**Status:** ✅ Production Ready (for simple inquiry forms)
