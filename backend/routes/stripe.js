// routes/stripe.js — Stripe checkout + webhook

const router  = require('express').Router();
const { getDb } = require('../db');

function getStripe() {
  return require('stripe')(process.env.STRIPE_SECRET_KEY);
}
const { requireAuth } = require('../middleware/auth');

const PRICES = {
  Standard: 19900, // $199.00 in cents
  Elite:    24900, // $249.00 in cents
};

// POST /api/stripe/checkout — Create a Stripe checkout session
router.post('/checkout', requireAuth, async (req, res) => {
  const { tier } = req.body;
  if (!PRICES[tier]) return res.status(400).json({ error: 'Invalid tier' });

  const db   = getDb();
  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user.id);
  if (!user) return res.status(404).json({ error: 'User not found' });

  try {
    const session = await getStripe().checkout.sessions.create({
      payment_method_types: ['card'],
      mode: 'payment',
      customer_email: user.email,
      line_items: [{
        price_data: {
          currency: 'usd',
          unit_amount: PRICES[tier],
          product_data: {
            name: `TEAM 3332 — ${tier} Membership`,
            description: tier === 'Elite'
              ? 'Elite annual membership: exclusive challenges, captain eligibility, priority support'
              : 'Standard annual membership: full platform access, leaderboards, challenges',
            images: [],
          },
        },
        quantity: 1,
      }],
      metadata: {
        user_id: String(req.user.id),
        tier,
      },
      success_url: `${process.env.CLIENT_URL}/app/index.html?payment=success&tier=${tier}`,
      cancel_url:  `${process.env.CLIENT_URL}/app/index.html?payment=cancelled`,
    });

    res.json({ url: session.url });
  } catch(e) {
    console.error('Stripe error:', e.message);
    res.status(500).json({ error: 'Could not create checkout session' });
  }
});

// GET /api/stripe/status — Check if current user has paid
router.get('/status', requireAuth, (req, res) => {
  const db   = getDb();
  const user = db.prepare('SELECT id, name, tier, subscription_status, subscription_expires_at FROM users WHERE id = ?').get(req.user.id);
  if (!user) return res.status(404).json({ error: 'User not found' });
  res.json({
    paid: user.subscription_status === 'active',
    tier: user.tier,
    subscription_status: user.subscription_status,
    subscription_expires_at: user.subscription_expires_at,
  });
});

// POST /api/stripe/webhook — Stripe sends payment confirmation here
router.post('/webhook', require('express').raw({ type: 'application/json' }), async (req, res) => {
  const sig = req.headers['stripe-signature'];
  let event;

  try {
    // In production, verify with STRIPE_WEBHOOK_SECRET
    // For dev, just parse the body directly
    event = process.env.STRIPE_WEBHOOK_SECRET
      ? getStripe().webhooks.constructEvent(req.body, sig, process.env.STRIPE_WEBHOOK_SECRET)
      : JSON.parse(req.body);
  } catch(e) {
    return res.status(400).json({ error: `Webhook error: ${e.message}` });
  }

  if (event.type === 'checkout.session.completed') {
    const session = event.data.object;
    const userId  = session.metadata?.user_id;
    const tier    = session.metadata?.tier;

    if (userId && tier) {
      const db = getDb();
      const expiresAt = new Date();
      expiresAt.setFullYear(expiresAt.getFullYear() + 1);

      db.prepare(`
        UPDATE users SET
          tier = ?,
          subscription_status = 'active',
          subscription_expires_at = ?
        WHERE id = ?
      `).run(tier, expiresAt.toISOString(), userId);

      console.log(`✅ Payment confirmed: User ${userId} → ${tier}`);
    }
  }

  res.json({ received: true });
});

module.exports = router;
