// Test script to verify rate limiting
async function testRateLimit() {
    const endpoint = "http://localhost:3000/api/csrf";
    const requests = [];

    console.log("Starting rate limit test...");
    console.log("Sending 105 requests rapidly...\n");

    for (let i = 1; i <= 105; i++) {
        const promise = fetch(endpoint, {
            headers: {
                "User-Agent": "RateLimitTestBot/1.0",
            },
        })
            .then(async (response) => {
                const remaining = response.headers.get("X-RateLimit-Remaining");
                const limit = response.headers.get("X-RateLimit-Limit");

                return {
                    requestNumber: i,
                    status: response.status,
                    remaining: remaining,
                    limit: limit,
                    blocked: response.status === 429,
                };
            })
            .catch((error) => {
                return {
                    requestNumber: i,
                    error: error.message,
                };
            });

        requests.push(promise);

        // Small delay to avoid overwhelming the server completely
        await new Promise((resolve) => setTimeout(resolve, 50));
    }

    const results = await Promise.all(requests);

    // Analyze results
    const successful = results.filter((r) => r.status === 200);
    const blocked = results.filter((r) => r.blocked);

    console.log("\n=== TEST RESULTS ===");
    console.log(`Total requests sent: ${results.length}`);
    console.log(`Successful requests: ${successful.length}`);
    console.log(`Blocked requests: ${blocked.length}`);
    console.log("\nFirst 10 requests:");
    results.slice(0, 10).forEach((r) => {
        console.log(
            `  Request ${r.requestNumber}: Status ${r.status}, Remaining: ${r.remaining}/${r.limit}`
        );
    });
    console.log("\nLast 10 requests:");
    results.slice(-10).forEach((r) => {
        console.log(
            `  Request ${r.requestNumber}: Status ${r.status}, Remaining: ${r.remaining}/${r.limit}`
        );
    });

    if (blocked.length > 0) {
        console.log("\n✓ Rate limiting is working correctly!");
        console.log(`Requests were blocked starting from request #${blocked[0].requestNumber}`);
    } else {
        console.log("\n✗ No requests were blocked. Rate limiter may not be configured correctly.");
    }
}

testRateLimit();
