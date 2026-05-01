const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const { JWT_SECRET } = require('./jwtSecret');

const ADMIN_TOKEN_EXPIRES_IN = parseInt(process.env.ADMIN_LOGIN_TOKEN_TTL || '3600', 10);

const normalize = (value) => `${value || ''}`.trim();

const constantTimeEqual = (left, right) => {
  const leftBuffer = Buffer.from(`${left || ''}`);
  const rightBuffer = Buffer.from(`${right || ''}`);
  if (leftBuffer.length !== rightBuffer.length) {
    return false;
  }
  return crypto.timingSafeEqual(leftBuffer, rightBuffer);
};

const sha256 = (value) => crypto.createHash('sha256').update(`${value || ''}`).digest('hex');

const getConfiguredAdmin = () => {
  const username = normalize(process.env.ADMIN_LOGIN_USERNAME);
  const keyHash = normalize(process.env.ADMIN_LOGIN_KEY_HASH);
  if (!username || !keyHash) {
    return null;
  }
  return {
    username,
    keyHash,
    canReveal: process.env.ADMIN_LOGIN_CAN_REVEAL === 'true'
  };
};

const verifyAdminCredential = ({ username, key }) => {
  const configured = getConfiguredAdmin();
  if (!configured) {
    return { ok: false, reason: 'not_configured' };
  }

  if (!constantTimeEqual(normalize(username), configured.username)) {
    return { ok: false, reason: 'invalid' };
  }

  const expectedHash = configured.keyHash.startsWith('sha256:')
    ? configured.keyHash.slice('sha256:'.length)
    : configured.keyHash;
  const actualHash = sha256(key);
  if (!constantTimeEqual(actualHash, expectedHash)) {
    return { ok: false, reason: 'invalid' };
  }

  return {
    ok: true,
    admin: {
      id: `admin:${configured.username}`,
      username: configured.username,
      canReveal: configured.canReveal
    }
  };
};

const issueAdminToken = (admin) => jwt.sign(
  {
    type: 'admin',
    adminId: admin.id,
    adminUsername: admin.username,
    canReveal: Boolean(admin.canReveal)
  },
  JWT_SECRET,
  { expiresIn: ADMIN_TOKEN_EXPIRES_IN }
);

const verifyAdminToken = (token) => {
  const decoded = jwt.verify(token, JWT_SECRET);
  if (decoded.type !== 'admin' || !decoded.adminUsername || !decoded.adminId) {
    return null;
  }
  return {
    id: decoded.adminId,
    username: decoded.adminUsername,
    canReveal: Boolean(decoded.canReveal)
  };
};

module.exports = {
  ADMIN_TOKEN_EXPIRES_IN,
  getConfiguredAdmin,
  verifyAdminCredential,
  issueAdminToken,
  verifyAdminToken
};
