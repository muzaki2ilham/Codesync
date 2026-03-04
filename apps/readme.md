# CodeSync Pro Engine

CodeSync Pro adalah platform editor kode kolaboratif real-time yang memungkinkan beberapa pengguna untuk menulis, mengedit, dan menjalankan kode secara bersamaan dalam lingkungan sandbox yang aman menggunakan Docker.

## Fitur Utama
* **Real-time Collaboration**: Sinkronisasi kode antar pengguna secara instan menggunakan Socket.io.
* **Multi-Language Support**: Mendukung eksekusi kode untuk **JavaScript**, **Python**, dan **Golang**.
* **Isolated Execution (Sandboxing)**: Setiap kode dijalankan di dalam container Docker yang terisolasi untuk keamanan server.
* **Database Persistence**: Menggunakan MongoDB 4.4 untuk menyimpan kode berdasarkan `Room ID`, sehingga data tidak hilang saat halaman di-refresh.
* **Room System**: Pengguna dapat membuat atau bergabung ke ruangan tertentu menggunakan ID unik.
* **Monaco Editor**: Menggunakan engine editor yang sama dengan VS Code untuk pengalaman koding yang maksimal.

## Arsitektur Teknologi
| Komponen | Teknologi |
| --- | --- |
| **Frontend** | HTML5, CSS3, Monaco Editor API |
| **Backend** | Node.js, Express, Socket.io |
| **Database** | MongoDB 4.4 (Compatibility Mode for Non-AVX CPUs) |
| **Virtualization** | Docker Engine (Sandboxed Runtime) |



## Cara Menjalankan (Local Setup)

### 1. Prasyarat
* Node.js terinstal di laptop.
* Docker Desktop terinstal dan berjalan (WSL 2 aktif).
* Download image Docker yang diperlukan:
    ```bash
    docker pull node:18-alpine
    docker pull python:3.10-alpine
    docker pull golang:1.20-alpine
    docker pull mongo:4.4
    ```

### 2. Jalankan Database (MongoDB)
Jalankan container MongoDB versi 4.4 (mendukung semua jenis CPU):
```bash
docker run -d --name mongodb-codesync -p 27017:27017 mongo:4.4