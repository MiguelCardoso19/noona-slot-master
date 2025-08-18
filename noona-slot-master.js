import fetch from 'node-fetch';

const CONFIG = {
    API_KEY: "API_KEY",
    COMPANY_ID: "COMPANY_ID",
    EMPLOYEE_ID: "EMPLOYEE_ID",
    EVENT_TYPE_ID: "EVENT_TYPE_ID",
    START_DATE: "2025-08-16",
    DAY_OF_WEEK: 6,
    DESIRED_TIME: '11:00',
    DAYS_BETWEEN_BOOKINGS: 14,
    CUSTOMER: {
        name: "name",
        email: "email",
        phone: { code: "351", number: "91111111" }
    }
};

const HEADERS = {
    "Authorization": `Bearer ${CONFIG.API_KEY}`,
    "Content-Type": "application/json"
};

async function fetchTimeSlots() {
    const today = new Date().toISOString().split('T')[0];
    const endDate = new Date();
    endDate.setMonth(endDate.getMonth() + 3);
    const url = `https://api.noona.is/v1/marketplace/companies/${CONFIG.COMPANY_ID}/time_slots?` +
        `employee_id=${CONFIG.EMPLOYEE_ID}&event_type_ids[]=${CONFIG.EVENT_TYPE_ID}&` +
        `start_date=${today}&end_date=${endDate.toISOString().split('T')[0]}`;

    const res = await fetch(url, { headers: HEADERS });
    return res.ok ? res.json() : Promise.reject(`API error: ${res.status}`);
}

function findAvailableDays(slots) {
    let nextDate = new Date(CONFIG.START_DATE).getTime();
    const results = [];

    const slotMap = new Map();
    for (const day of slots) {
        slotMap.set(day.date, day.slots || []);
    }

    const allDates = [...slotMap.keys()].sort();
    const lastAvailable = new Date(allDates[allDates.length - 1]).getTime();

    while (nextDate <= lastAvailable) {
        const dateObj = new Date(nextDate);
        const dateStr = dateObj.toISOString().split('T')[0];

        if (slotMap.has(dateStr) && dateObj.getDay() === CONFIG.DAY_OF_WEEK) {
            const slotsForDay = slotMap.get(dateStr);
            const matchingSlot = slotsForDay.find(s => s.time === CONFIG.DESIRED_TIME);

            if (matchingSlot) {
                results.push({
                    date: dateStr,
                    time: matchingSlot.time,
                    startTime: `${dateStr}T${matchingSlot.time}:00.000+00:00`
                });
            }
        }

        nextDate += CONFIG.DAYS_BETWEEN_BOOKINGS * 86400000;
    }

    return results;
}

async function bookSlot(slot) {
    try {
        const reservePayload = {
            company: CONFIG.COMPANY_ID,
            employee: CONFIG.EMPLOYEE_ID,
            event_types: [CONFIG.EVENT_TYPE_ID],
            starts_at: slot.startTime,
            payment_intents: []
        };

        const reserveRes = await fetch("https://api.noona.is/v1/marketplace/time_slot_reservations", {
            method: "POST",
            headers: HEADERS,
            body: JSON.stringify(reservePayload)
        });

        if (!reserveRes.ok) {
            const errorBody = await reserveRes.text();
            throw new Error(`Reservation failed: ${reserveRes.status} - ${errorBody}`);
        }

        const reservation = await reserveRes.json();

        const bookingPayload = {
            time_slot_reservation: reservation.id,
            customer_name: CONFIG.CUSTOMER.name,
            email: CONFIG.CUSTOMER.email,
            phone_country_code: CONFIG.CUSTOMER.phone.code,
            phone_number: CONFIG.CUSTOMER.phone.number,
            no_show_acknowledged: true,
            origin: "online",
            booking_for_other: false
        };

        const bookingRes = await fetch(
            "https://api.noona.is/v1/marketplace/events",
            {
                method: "POST",
                headers: HEADERS,
                body: JSON.stringify(bookingPayload)
            }
        );

        if (!bookingRes.ok) {
            const errorBody = await bookingRes.text();
            throw new Error(`Booking failed: ${bookingRes.status} - ${errorBody}`);
        }

        return true;
    } catch (err) {
        console.error(`Booking error for ${slot.date}:`, err.message);
        return false;
    }
}

(async () => {
    try {
        const slots = await fetchTimeSlots();

        const availableDays = findAvailableDays(slots);

        if (availableDays.length === 0) {
            console.log('No available days found');
            return;
        }

        for (const slot of availableDays) {
            console.log(`Attempting to book ${slot.date} at ${slot.time}`);
            const success = await bookSlot(slot);
            console.log(`${slot.date} ${slot.time}: ${success ? 'SUCCESS' : 'FAILED'}`);
        }
    } catch (err) {
        console.error('Fatal error:', err.message);
    }
})();