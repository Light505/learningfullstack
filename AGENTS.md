# AGENTS.md

## 🌍 About Me
I am a college IT student learning how to build **production-ready websites**.  
My chosen stack is:
- **Docker** → containerization and deployment  
- **Apache** → web server management  
- **MySQL** → database management  
- **PHP** → front-end and back-end development  

My priorities are **security, optimization, and ease of deployment**.  
I want to learn independently, guided by GitHub Copilot and other trusted resources.

---

## 🧭 Core Values
1. **Security First** → Protect users, data, and infrastructure.  
2. **Optimization Always** → Write efficient, scalable, and maintainable code.  
3. **Ease of Deployment** → Automate and simplify workflows for reliability.  
4. **Continuous Learning** → Learn by doing, researching, and experimenting.  
5. **Professional Readiness** → Build habits and skills aligned with industry standards.  

---

## 📖 Learning Philosophy
- Treat every project as if it were **production-ready**, even when practicing.  
- Document everything I learn for future reference.  
- Balance **self-learning** with guidance from Copilot and other resources.  
- Build a portfolio that demonstrates **real-world skills**.  

---

## ✅ Roadmap & Checklist

### 🟢 Short-Term (Beginner)
- [ ] Learn **Docker basics**: build, run, and manage containers.  
- [ ] Set up a simple **Apache server** inside Docker.  
- [ ] Create a **MySQL database** and connect it to PHP.  
- [ ] Write basic **PHP scripts** for CRUD operations.  
- [ ] Practice **Git & GitHub version control**.  
- [ ] Understand **basic security practices** (input validation, HTTPS).  

### 🟡 Mid-Term (Intermediate)
- [ ] Use **Docker Compose** for multi-container setups (Apache + MySQL + PHP).  
- [ ] Configure **Apache virtual hosts** and enable SSL/TLS.  
- [ ] Apply **indexes and normalization** in MySQL for performance.  
- [ ] Write **secure PHP code** with prepared statements.  
- [ ] Explore **MVC patterns** and frameworks (e.g., Laravel).  
- [ ] Automate deployments with **CI/CD pipelines** (GitHub Actions).  
- [ ] Learn **basic testing** (unit tests for PHP).  

### 🔵 Long-Term (Advanced)
- [ ] Optimize Docker images (multi-stage builds, minimal base images).  
- [ ] Implement **caching and compression** in Apache.  
- [ ] Scale MySQL with **replication and backups**.  
- [ ] Build **secure authentication systems** (password hashing, sessions, tokens).  
- [ ] Deploy projects to **cloud providers** (AWS, Azure, DigitalOcean).  
- [ ] Monitor performance with **logging and profiling tools**.  
- [ ] Contribute to **open-source projects** for real-world experience.  
- [ ] Prepare for **professional roles** with a strong portfolio.  

---

## 🚀 Long-Term Vision
I aim to become a **professional web developer** who can design, build, and deploy secure, optimized, and scalable websites.  
My journey is guided by curiosity, discipline, and a commitment to industry best practices.  

---

## Current Deployment Direction

This project is learning from the Dreams of Code VPS deployment guide, but it is
not trying to copy that system identically. Use the guide as a reference for
deployment ideas and production habits, not as a strict blueprint.

Current deployment pattern:
- Work on `dev`.
- Merge tested work into `main`.
- Build the web image from `main` manually.
- Push the image to GitHub Container Registry: `ghcr.io/light505/learningfullstack`.
- Run only runtime deployment files on the VPS.
- Use Docker Compose for the VPS stack.
- Use Traefik for HTTPS and routing.
- Use Watchtower to poll the `prod` image tag and restart the `web` container.
- Keep MySQL on the same VPS for now.

Intentional differences from the guide:
- This app uses PHP/Apache and MySQL, not the guide's app/database stack.
- The current deployment can run three `web` replicas behind Traefik on the VPS.
- Watchtower is used for simple image updates now; Swarm/Kubernetes-style
  rolling deployments are deferred until scaling is actually needed.
- Secrets are currently managed with a protected `.env` file, not Docker
  secrets. Revisit this later as the deployment matures.
- Uptime monitoring is optional and belongs after the core deployment is stable.

Current important docs:
- `DEPLOYMENT.md` - VPS deployment steps 5-10.
- `COMPOSE.md` - Compose file roles.
- `DEVELOPMENT_PLAN.md` - phased infrastructure roadmap.

When assisting with deployment, preserve this learning path:
- Explain the concept clearly.
- Prefer small, verifiable steps.
- Avoid introducing advanced orchestration until the current phase is stable.
- Keep the VPS deployment folder minimal: `.env`, Compose files, and
  `database/init.sql`.
- Never put secrets directly in Git-tracked files.
