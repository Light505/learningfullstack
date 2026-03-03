# TODO - Future Enhancements

## 🎯 High Priority

- [ ] **Email Notifications**
  - Send confirmation email to user after inquiry submission
  - Send notification email to admin/support team
  - Implement SMTP configuration (SendGrid, AWS SES, or local Postfix)
  - Template system for email formats

- [ ] **Admin Dashboard**
  - Simple admin panel to view inquiries (http://localhost:8080/admin)
  - Mark inquiries as 'read' / 'replied'
  - Filter/search inquiries by date, status, email
  - Delete inquiries
  - Basic authentication (username/password)

- [ ] **Contact Information**
  - Add phone field to form
  - Add department/category dropdown (support, sales, general)
  - Optional fields with client-side validation

- [ ] **SSL/HTTPS**
  - Set up Let's Encrypt certificate
  - Redirect HTTP → HTTPS
  - Nginx reverse proxy configuration

---

## 🔧 Medium Priority

- [ ] **Email Template System**
  - HTML email templates for confirmations
  - Dynamic content (user name, inquiry details)
  - Branding/logo in emails

- [ ] **Rate Limit Dashboard**
  - View current rate limit status
  - Monitor IP addresses hitting limits
  - Whitelist/blacklist IPs

- [ ] **Form Analytics**
  - Track submissions over time (chart)
  - Response time metrics
  - Submission source detection

- [ ] **Captcha Integration**
  - Add Google reCAPTCHA v3 to prevent bot submissions
  - Fallback: Math/image captcha

- [ ] **Multi-language Support**
  - Form labels/messages in multiple languages
  - Detect user language preference
  - Language switcher

- [ ] **Progressive Web App (PWA)**
  - Offline form caching
  - Install as app on mobile
  - Push notifications for responses

---

## 🐛 Low Priority (Nice-to-Have)

- [ ] **File Attachments**
  - Allow users to upload files (PDF, images, docs)
  - Virus scanning on upload
  - Store in S3 or local storage
  - Size limits (10MB max)

- [ ] **Inquiry Status Tracking**
  - User gets tracking link to check status
  - Email updates when status changes
  - Timeline/history of inquiry

- [ ] **API Endpoint**
  - RESTful API for form submissions (non-web clients)
  - JSON responses
  - API authentication (API keys)

- [ ] **Database Optimization**
  - Indexing on frequently queried columns (email, ip_address)
  - Archive old inquiries (> 1 year) to archive table
  - Query optimization & performance monitoring

- [ ] **Logging & Monitoring**
  - Structured logging (JSON format)
  - Send logs to ELK stack or CloudWatch
  - Error alerting (Slack, PagerDuty)

- [ ] **Testing Suite**
  - Unit tests for validation logic
  - Integration tests for form submission
  - Security tests (CSRF, XSS, SQL injection)
  - Load testing (JMeter, Locust)

---

## 🔐 Security Enhancements

- [ ] **IP Proxy Detection**
  - Detect Cloudflare, VPN, proxies
  - Handle `X-Forwarded-For` header safely
  - Log suspicious IPs

- [ ] **Rate Limit Refinements**
  - Different limits for logged-in users vs anonymous
  - Exponential backoff (increase wait time after repeated limits)
  - Whitelist trusted IPs

- [ ] **Content Security Policy (CSP)**
  - Strict CSP to prevent inline scripts
  - Nonce-based script execution

- [ ] **CORS Headers**
  - IfAPI endpoint added, configure CORS properly

- [ ] **Dependency Updates**
  - Keep PHP, MySQL, Apache updated
  - Set up automated security patches
  - Regular tool audits (composer audit, npm audit)

---

## 📱 Frontend Improvements

- [ ] **Better Form Validation**
  - Real-time validation feedback
  - Inline error messages per field
  - Password confirmation (if adding user accounts)

- [ ] **Accessibility (a11y)**
  - WCAG 2.1 AA compliance
  - Keyboard navigation full support
  - Screen reader testing
  - High contrast mode support

- [ ] **Mobile Optimization**
  - Test on actual mobile devices
  - Touch-friendly form inputs
  - Responsive breakpoints refinement

- [ ] **Dark Mode**
  - Toggle dark/light theme
  - Respect `prefers-color-scheme` OS setting
  - Persist preference in localStorage

- [ ] **Animation & Transitions**
  - Smooth page transitions
  - Loading skeleton screens
  - Microinteractions feedback

---

## 🗄️ Infrastructure & DevOps

- [ ] **CI/CD Pipeline**
  - GitHub Actions / GitLab CI
  - Automated testing on push
  - Automated deployment to staging
  - Manual approval for production

- [ ] **Container Registry**
  - Push custom image to Docker Hub / ECR
  - Version tagging
  - Automated image updates

- [ ] **Kubernetes Deployment**
  - Convert docker-compose to Helm charts
  - Auto-scaling based on load
  - Service mesh (Istio, Linkerd)

- [ ] **Database Migration**
  - Move from containerized MySQL to managed service (RDS, CloudSQL)
  - Connection pooling (PgBouncer if using PostgreSQL)
  - Automatic backups with cloud provider

- [ ] **CDN Integration**
  - CloudFront / Cloudflare for static assets
  - Image optimization
  - DDoS protection

- [ ] **Monitoring & Observability**
  - Prometheus for metrics
  - Grafana dashboards
  - Application Performance Monitoring (New Relic, DataDog)

---

## 📊 Analytics & Reporting

- [ ] **Inquiry Reports**
  - Monthly summary report
  - Top inquiry sources
  - Response time analysis
  - Export to CSV/PDF

- [ ] **Business Metrics**
  - Daily/weekly active users
  - Conversion rate (visitors → inquiries)
  - Time-to-response tracking

---

## ✅ Completed Features

- ✅ Basic landing page with hero section
- ✅ Inquiry form with validation
- ✅ CSRF protection
- ✅ Rate limiting per IP
- ✅ MySQL database storage
- ✅ Security headers
- ✅ XSS/SQL injection prevention
- ✅ Input length validation
- ✅ Email format validation
- ✅ Docker containerization
- ✅ PhpMyAdmin admin interface
- ✅ Character counter on textarea
- ✅ Clean success/error messaging
- ✅ Graceful degradation for missing DB columns

---

## 🎓 Learning Resources

- [OWASP Top 10](https://owasp.org/www-project-top-ten/)
- [PHP Security Best Practices](https://www.php.net/manual/en/security.php)
- [Docker Security](https://docs.docker.com/engine/security/)
- [Web Accessibility (WCAG)](https://www.w3.org/WAI/WCAG21/quickref/)

---

**Status:** Project is stable and production-ready for MVP use case  
**Next Phase:** Email notifications and admin dashboard recommended for scaling
