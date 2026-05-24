# learningfullstack
Learning CI/CD with docker
STACK: Apache, MySQL, PHP

## Database setup

Create the database schema manually after starting MySQL:

```powershell
docker exec -i db mysql -u root -p < database/init.sql
```
