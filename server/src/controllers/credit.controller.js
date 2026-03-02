import { asyncHandler } from "../../utils/asyncHandler.js";
import { ApiError } from "../../utils/apiError.js";
import { ApiResponse } from "../../utils/apiResponse.js";
import { Transaction } from "../models/transaction.model.js";
import Stripe from "stripe";


const plans = [

    {
        _id: "basic",
        name: "Basic",
        price: 10,
        credits: 100,
        features: ['100 text generations', '50 image generations', 'Standard support', 'Access to basic models']
    },
    {
        _id: "pro",
        name: "Pro (Recommended)",
        price: 20,
        credits: 500,
        features: ['500 text generations', '200 image generations', 'Priority support', 'Access to pro models', 'Faster response time']
    },
    {
        _id: "premium",
        name: "Premium",
        price: 30,
        credits: 1000,
        features: ['1000 text generations', '500 image generations', '24/7 VIP support', 'Access to premium models', 'Dedicated account manager']
    }
]

//api to get all plans
const getAllPlans = asyncHandler(async (req, res) => {
    return res.status(200).json(
        new ApiResponse(200, plans, "Subscription plans fetched successfully")
    )
})

//api controller for purchasing a plan

const getStripeClient = () => {
    const stripeSecretKey = process.env.STRIPE_SECRET_KEY;

    if (!stripeSecretKey) {
        throw new ApiError(500, "STRIPE_SECRET_KEY is missing on server")
    }

    return new Stripe(stripeSecretKey)
}

const purchasePlan = asyncHandler(async (req, res) => {
    const stripe = getStripeClient();
    const rawPlanId = req.body?.planId
        ?? req.body?.planID
        ?? req.body?._id
        ?? req.body?.id
        ?? req.query?.planId
        ?? req.params?.planId
        ?? "";

    const normalizedPlanId = String(rawPlanId).trim().toLowerCase();
    const userId = req.user?._id;

    if (!normalizedPlanId) {
        throw new ApiError(400, "planId is required")
    }

    const plan = plans.find((plan) => plan._id === normalizedPlanId);
    if (!plan) {
        throw new ApiError(404, "Plan not found", [
            `Valid planId values: ${plans.map((p) => p._id).join(", ")}`
        ])
    }

    const originUrl = req.get("origin") || process.env.CLIENT_URL || process.env.CORS_ORIGIN;
    if (!originUrl) {
        throw new ApiError(400, "Origin URL is missing. Send Origin header or configure CLIENT_URL")
    }
    // In real application, you should create the transaction after successful payment gateway response, but for simplicity we are creating it before redirecting to stripe checkout page, and then updating it after receiving webhook from stripe about successful payment
    const transaction = await Transaction.create({
        userId,
        planId: normalizedPlanId,
        amount: plan.price,
        credits: plan.credits,
        isPaid: false // In real application, this should be set after successful payment gateway response
    })

    const session = await stripe.checkout.sessions.create({
        line_items: [
            {
                price_data: {
                    currency: 'usd',
                    unit_amount: plan.price * 100, // Stripe expects amount in cents
                    product_data: {
                        name: plan.name,
                        description: plan.features.join(", ")
                    }
                },
                quantity: 1
            }
        ],
        mode: 'payment',
        success_url: `${originUrl}/loading/payment-success?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${originUrl}/loading/payment-cancelled`,
        metadata: {
            transactionId: transaction._id.toString(),
            appId: "samvaad-ai"
        },
        expires_at: Math.floor(Date.now() / 1000) + (30 * 60) // Session expires in 30 minutes

    })
    return res.status(200).json(
        new ApiResponse(200, {
            transaction,
            sessionId: session.id,
            sessionUrl: session.url
        }, "Payment session created successfully")
    )
})


export { getAllPlans, purchasePlan }