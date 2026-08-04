# Security & Code Quality Audit

This document records key security mechanisms, vulnerability remediations, and code quality safeguards implemented in Silent Signal.

## 🔒 Security Architecture & Hardening

### 1. Password Hashing (Bcrypt)
- **Implementation**: Hashed with `bcryptjs` (10 salt rounds) for user passwords and Duress PINs.
- **Verification**: Uses timing-safe comparison `bcrypt.compare()` during login and duress authentication.

### 2. Authorization & Ownership Checks
- **Token Middleware**: `authenticateToken` middleware validates JWT tokens on protected endpoints.
- **Resource Ownership**: Endpoints verify `userId` ownership on contacts, notes, and evidence logs before reading, modifying, or deleting records.

### 3. Data Protection & Encryption
- **Encrypted GPS Storage**: AES-256-GCM encryption for stored coordinate locations using `ENCRYPTION_KEY`.
- **Expiring Evidence Links**: Public evidence sharing links automatically expire after `EVIDENCE_TTL_HOURS`.

### 4. Input Validation & Sanitization
- Input sanitization & pattern checking for usernames, passwords, phone numbers, and coordinates to prevent malformed data and injection attacks.

### 5. API Protection & CORS
- **Rate Limiting**: Express rate limiters protect `/api/auth/login` and trigger endpoints against brute-force attacks.
- **CORS Scope**: Configurable allowed origin via `CORS_ORIGIN`.

---

## 🛠️ Testing & Verification Recommendations

1. **Authentication Tests**:
   ```bash
   # Register account
   curl -X POST http://localhost:3000/api/auth/register \
     -H "Content-Type: application/json" \
     -d '{"username":"testuser","password":"securepassword123","duressPin":"9999"}'

   # Stealth Duress Login
   curl -X POST http://localhost:3000/api/auth/login \
     -H "Content-Type: application/json" \
     -d '{"username":"testuser","password":"9999"}'
   ```

2. **CI Secret Scan & Automated Checks**:
   - Automated via GitHub Actions workflow (`.github/workflows/ci.yml`).
