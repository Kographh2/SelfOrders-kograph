# SelfOrder - Web App Self Ordering System

Aplikasi web self-ordering lengkap dengan sistem role-based access control, Midtrans Snap integration, dan UI modern.

## 🎯 Fitur Utama

### User (Mobile-First)
- ✅ Browse menu tanpa login (anonymous)
- ✅ Search menu
- ✅ Keranjang belanja
- ✅ Checkout dengan Midtrans Snap (QRIS, GoPay, OVO, DANA, Tunai)
- ✅ Floating Pill Navigation + Circular FAB
- ✅ Push notification prompt
- ✅ Responsif untuk mobile

### Admin/Owner (Desktop/Responsive)
- ✅ Dashboard dengan statistik lengkap
- ✅ Manajemen user (Owner bisa hapus user)
- ✅ Manajemen toko/cabang (multiple stores)
- ✅ QR Code generator untuk nomor meja
- ✅ Manajemen kategori menu
- ✅ Manajemen menu items
- ✅ Lihat semua pesanan

### Kasir (Desktop/Responsive)
- ✅ Kitchen dashboard
- ✅ Update status pesanan
- ✅ Notifikasi real-time

## 🚀 Quick Start

```bash
# 1. Masuk ke direktori
cd D:\.01.production-web\01.SELF-ORDERS

# 2. Install dependencies
npm install

# 3. Setup environment variables
cp .env.local.example .env.local
# Edit .env.local dengan credentials Anda

# 4. Setup database (jalankan schema.sql di Supabase SQL Editor)
# Buka Supabase Dashboard > SQL Editor > New Query
# Copy-paste isi schema.sql dan jalankan

# 5. Run dev server
npm run dev
```

Buka http://localhost:3000

## 📁 Struktur Project

```
D:\.01.production-web\01.SELF-ORDERS/
├── prisma/
│   └── schema.prisma              # Database schema
├── public/
│   ├── push-sw.js                 # Service Worker untuk push notification
│   ├── manifest.json              # PWA manifest
│   └── icon-*.png                 # App icons
├── src/
│   ├── app/
│   │   ├── (root)/page.tsx        # Redirect ke /menu (no landing page)
│   │   ├── menu/page.tsx          # User menu page (mobile)
│   │   ├── login/page.tsx         # Login page
│   │   ├── register/page.tsx      # Register page
│   │   ├── dashboard/
│   │   │   ├── layout.tsx         # Dashboard layout with sidebar
│   │   │   ├── page.tsx           # Admin/Owner dashboard
│   │   │   ├── kitchen/page.tsx   # Kitchen dashboard
│   │   │   ├── qr-generator/page.tsx
│   │   │   ├── stores/page.tsx
│   │   │   ├── orders/page.tsx
│   │   │   ├── menu/
│   │   │   │   ├── categories/page.tsx
│   │   │   │   └── items/page.tsx
│   │   │   └── users/page.tsx
│   │   └── api/
│   │       ├── auth/
│   │       │   ├── login/route.ts
│   │       │   ├── register/route.ts
│   │       │   └── anonymous/route.ts
│   │       ├── stores/route.ts
│   │       ├── stores/[storeId]/route.ts
│   │       ├── menu/
│   │       │   ├── categories/route.ts
│   │       │   ├── categories/[categoryId]/route.ts
│   │       │   ├── items/route.ts
│   │       │   └── items/[itemId]/route.ts
│   │       ├── tables/route.ts
│   │       ├── tables/[tableId]/route.ts
│   │       ├── orders/route.ts
│   │       ├── orders/[orderId]/route.ts
│   │       ├── payment/
│   │       │   ├── midtrans/route.ts
│   │       │   └── notification/route.ts
│   │       ├── users/route.ts
│   │       └── dashboard/stats/route.ts
│   ├── components/
│   │   ├── ui/
│   │   │   ├── Animations.tsx     # Animation utilities (stagger, fade, slide)
│   │   │   └── ModernAlert.tsx    # Modern alert component
│   │   ├── FloatingNav.tsx        # Floating Pill Navigation + FAB
│   │   ├── NotificationPrompt.tsx # Push notification prompt popup
│   │   ├── AuthPrompt.tsx         # Login/Register modal
│   │   ├── CartDrawer.tsx         # Slide-up cart drawer
│   │   ├── PaymentModal.tsx       # Payment method selection
│   │   ├── DeleteUserModal.tsx    # Delete user confirmation
│   │   ├── PushNotificationProvider.tsx
│   │   └── Providers.tsx          # App providers wrapper
│   ├── contexts/
│   │   └── AuthContext.tsx        # Auth state management
│   ├── lib/
│   │   ├── supabase.ts            # Supabase client
│   │   ├── supabase-server.ts     # Supabase admin client
│   │   ├── auth.ts                # Auth utilities (JWT)
│   │   ├── midtrans.ts            # Midtrans Snap integration
│   │   └── database.ts            # Supabase query helpers
│   └── types/
│       └── index.ts               # TypeScript types
```

## 🎨 UI Components

### Floating Pill Navigation + Circular FAB
- **Floating Pill**: Navigasi utama (Home, Search, Cart, Profile) dengan badge cart
- **Circular FAB**: Menu aksi tambahan (Notifications, QR Code, Settings)
- Animasi smooth dengan Framer Motion

### Modern Alert
- Success, Error, Warning, Info
- Auto-dismiss dengan progress bar
- Animasi slide-in/out

### Payment Modal
- Pilih metode pembayaran (QRIS, GoPay, OVO, DANA, Bank Transfer, Tunai)
- Proses pembayaran via Midtrans Snap
- Konfirmasi real-time

### Notification Prompt
- Prompt untuk enable push notification
- Graceful fallback jika ditolak
- Lalu lanjut ke login/register popup

## 🔧 Environment Variables

```env
# Supabase
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your-anon-key
SUPABASE_SERVICE_ROLE_KEY=your-service-role-key

# Midtrans
MIDTRANS_SERVER_KEY=your-server-key
MIDTRANS_CLIENT_KEY=your-client-key
NEXT_PUBLIC_MIDTRANS_CLIENT_KEY=your-client-key

# App
NEXT_PUBLIC_APP_URL=http://localhost:3000
NEXT_PUBLIC_APP_NAME=SelfOrder

# JWT Secret for API authentication
JWT_SECRET=your-super-secret-jwt-key-change-in-production
```

## 📊 Database Schema

### Tables
- `stores` - Cabang toko
- `categories` - Kategori menu
- `menu_items` - Menu items
- `tables` - Nomor meja dengan QR code
- `orders` - Pesanan
- `order_items` - Item dalam pesanan
- `payments` - Pembayaran
- `users` - User (managed via Supabase Auth)

### Role System
- **admin**: Full access
- **owner**: Full access + delete users
- **kasir**: Kitchen dashboard, order management
- **user**: View menu, order, pay

## 🔔 Push Notifications

Push notifications menggunakan:
- Service Worker (`push-sw.js`)
- Notification API browser
- Prompt saat pertama buka app

Flow:
1. User buka app → Prompt notification
2. User enable/disable → Tampil auth prompt
3. User login/register/anonymous → Lanjut ke menu

## 💳 Payment Integration

### Midtrans Snap
- QRIS
- GoPay
- OVO
- DANA
- ShopeePay
- Bank Transfer
- Credit/Debit Card
- Tunai (Cash)

Flow:
1. User checkout → Create order
2. Pilih metode pembayaran
3. Initiate Midtrans Snap transaction
4. Tampilkan Snap modal via `window.snap.pay()`
5. Payment notification callback
6. Update order status

## 📱 User Experience

### Mobile (User)
- Full-screen menu browsing
- Floating pill navigation
- Search functionality
- Cart with badge
- Smooth animations
- Modern payment modal

### Desktop (Admin/Kasir/Owner)
- Responsive dashboard
- Sidebar navigation
- Data tables
- CRUD operations
- QR code generation
- Real-time order updates

## 🎭 Animations

- Framer Motion untuk semua animasi
- Stagger animations untuk list items
- Scale, fade, slide transitions
- Loading spinners
- Toast notifications (react-hot-toast)

## 🔐 Security

- JWT untuk API authentication
- Role-based access control
- Supabase Auth untuk user management
- Anonymous sign-in enabled
- Manual linking APIs enabled

## 📝 Supabase Settings (Recommended)

1. **Allow new users to sign up**: `Enabled` (untuk registrasi user)
2. **Allow manual linking**: `Enabled`
3. **Allow anonymous sign-ins**: `Enabled` (PENTING untuk user yang tidak mau login)
4. **Confirm email**: `Disabled` (untuk UX lebih baik, bisa di-enable nanti)

## 🚢 Deployment

### Vercel (Recommended)
```bash
npm i -g vercel
vercel
```

### Other Platforms
- Netlify
- Railway
- Render

## 🛠️ Development Commands

```bash
npm run dev      # Development server
npm run build    # Production build
npm run start    # Production server
npm run lint     # ESLint
npm run typecheck # TypeScript type checking
```

## 📄 License

MIT

---

**Created with ❤️ for efficient self-ordering experience**