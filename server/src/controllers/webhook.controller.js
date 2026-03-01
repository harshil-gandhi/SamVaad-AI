import Stripe from "stripe";
import { asyncHandler } from "../../utils/asyncHandler.js";
import { Transaction } from "../models/transaction.model.js";
import { User } from "../models/user.model.js";

const getStripeClient = () => {
    const stripeSecretKey = process.env.STRIPE_SECRET_KEY;

    if (!stripeSecretKey) {
        throw new Error("STRIPE_SECRET_KEY is missing on server")
    }

    return new Stripe(stripeSecretKey)
}

const markTransactionPaidAndCreditUser = async (session) => {
    const transactionId = session?.metadata?.transactionId;
    const appId = session?.metadata?.appId;

    if (!transactionId || appId !== "samvaad-ai") {
        return;
    }

    const transaction = await Transaction.findById(transactionId);
    if (!transaction || transaction.isPaid) {
        return;
    }

    transaction.isPaid = true;
    await transaction.save();

    await User.findByIdAndUpdate(transaction.userId, {
        $inc: { credits: transaction.credits }
    });
};

const stripeWebhook = asyncHandler(async (req, res) => {
    const stripe = getStripeClient();
    const webhookSecret = process.env.STRIPE_WEBHOOK_SECRET;
    const signature = req.headers["stripe-signature"];

    if (!signature) {
        return res.status(400).json({ message: "Missing stripe-signature header" });
    }

    if (!webhookSecret) {
        return res.status(500).json({ message: "STRIPE_WEBHOOK_SECRET is missing on server" });
    }

    let event;
    try {
        const payload = Buffer.isBuffer(req.body)
            ? req.body
            : Buffer.from(JSON.stringify(req.body || {}));

        event = stripe.webhooks.constructEvent(
            payload,
            signature,
            webhookSecret
        );
    } catch (error) {
        return res.status(400).send(`Webhook Error: ${error.message}`);
    }

    switch (event.type) {
        case "checkout.session.completed":
        case "checkout.session.async_payment_succeeded": {
            const session = event.data.object;
            await markTransactionPaidAndCreditUser(session);
            break;
        }

        case "checkout.session.async_payment_failed":
        case "checkout.session.expired": {
            // Payment did not complete. Keep transaction as unpaid.
            break;
        }

        default:
            break;
    }

    return res.status(200).json({ received: true });
});

export { stripeWebhook };
