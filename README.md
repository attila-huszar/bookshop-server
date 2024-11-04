# Book Shop Backend

[![TypeScript](https://img.shields.io/badge/TypeScript-3178C6?logo=typescript&logoColor=fff)](https://www.typescriptlang.org/)
[![Bun](https://img.shields.io/badge/Bun-000?logo=bun)](https://bun.sh/)
[![Hono](https://img.shields.io/badge/Hono-E36002?logo=hono&logoColor=fff)](https://hono.dev/)
[![SQLite](https://img.shields.io/badge/SQLite-003B57?logo=sqlite)](https://www.sqlite.org/)
[![Drizzle](https://img.shields.io/badge/Drizzle-C5F74F?logo=drizzle&logoColor=000)](https://orm.drizzle.team/)
[![Docker](https://img.shields.io/badge/Docker-2496ED?logo=docker&logoColor=fff)](https://www.docker.com/)
[![Amazon EC2](https://img.shields.io/badge/EC2-FF9900?logo=amazonec2&logoColor=fff)](https://aws.amazon.com/ec2/)
[![ngrok](https://img.shields.io/badge/ngrok-1F1E37?logo=ngrok)](https://ngrok.com/)

Setup database and run container:

```sh
SETUP=true docker compose up
```

<details>
<summary>Windows cmd / powershell</summary>

```cmd
set SETUP=true && docker compose up
```

```powershell
$env:SETUP = "true"; docker compose up
```

</details>

(Deployed on EC2 instance, with docker and ngrok for https)
