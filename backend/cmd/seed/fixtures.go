package main

func acmeCases() map[string][]caseSpec {
	return map[string][]caseSpec{
		"One-time payment": {
			{
				title:               "Pay an invoice with a credit card",
				description:         "Customer pays a single invoice with a saved card.",
				preconditions:       "Customer is signed in with at least one saved card.",
				type_:               "functional",
				priority:            "critical",
				automationStatus:    "full",
				automationFramework: "Playwright",
				automationRef:       "apps/web-e2e/src/payments/pay-invoice.spec.ts",
				tags:                []string{"smoke", "happy-path", "money", "P0"},
				jiraKeys:            "JIRA-101",
				steps: []stepSpec{
					{"Navigate to /invoices and open a pending invoice.", "Invoice page renders with amount due."},
					{"Click 'Pay now'.", "Payment modal appears."},
					{"Confirm with default card.", "Card charge succeeds; modal shows receipt."},
					{"Close modal.", "Invoice status moves to 'Paid'."},
				},
			},
			{
				title:               "Pay an invoice across multiple payment methods",
				description:         "Verify checkout against different payment instruments.",
				type_:               "regression",
				priority:            "high",
				automationStatus:    "partial",
				automationFramework: "Cypress",
				automationRef:       "apps/web-e2e/src/payments/methods.cy.ts",
				tags:                []string{"regression", "money"},
				steps: []stepSpec{
					{"Open invoice and choose payment method {{method}}.", "Method selector shows {{method}}."},
					{"Confirm.", "Charge succeeds with {{method}}; receipt shows fee {{fee}}."},
				},
				parameters: []string{"method", "fee"},
				dataRows: []dataRowSpec{
					{label: "credit_card", values: map[string]string{"method": "credit card", "fee": "$0.30"}},
					{label: "ach", values: map[string]string{"method": "ACH", "fee": "$0.80"}},
					{label: "wire", values: map[string]string{"method": "wire", "fee": "$15.00"}},
					{label: "gift_card", values: map[string]string{"method": "gift card", "fee": "$0.00"}},
				},
			},
			{
				title:            "Pay invoice with declined card shows actionable error",
				description:      "Failure path — declined card should not charge.",
				type_:            "regression",
				priority:         "high",
				automationStatus: "not_automated",
				tags:             []string{"edge-case", "money"},
				steps: []stepSpec{
					{"Use the declining test card 4000-0000-0000-0002.", "Charge is declined; error message names the card."},
					{"Verify invoice unchanged.", "Invoice still 'Pending'; no audit row."},
				},
			},
		},
		"Recurring payments": {
			{
				title: "Create a monthly recurring schedule", description: "Customer enrolls in monthly auto-pay.",
				type_: "functional", priority: "high", automationStatus: "not_automated",
				tags: []string{"money", "happy-path"},
				steps: []stepSpec{
					{"Open the Subscriptions page.", "Active and past subscriptions render."},
					{"Click 'New schedule' and choose monthly.", "Form shows next charge date."},
					{"Confirm.", "Schedule listed under Active."},
				},
			},
			{
				title: "Recurring payment retries on a soft decline", description: "Verify retry policy after soft-decline.",
				type_: "regression", priority: "critical", automationStatus: "not_automated",
				tags: []string{"money", "regression", "release-blocker"},
				steps: []stepSpec{
					{"Trigger a soft decline via the test fixture.", "Initial charge fails."},
					{"Wait 1 minute (test clock).", "Retry succeeds; subscription stays active."},
				},
			},
			{
				title: "Cancel a recurring schedule keeps history", description: "Cancellation does not delete past charges.",
				type_: "functional", priority: "medium", automationStatus: "partial",
				automationFramework: "Cypress", automationRef: "apps/web-e2e/src/payments/cancel.cy.ts",
				tags: []string{"money"},
				steps: []stepSpec{
					{"Cancel an active schedule.", "Schedule moves to 'Canceled'."},
					{"Open history tab.", "Past charges are visible and immutable."},
				},
			},
		},
		"Refunds": {
			{
				title: "Refund a successful credit card payment", description: "Issue a full refund and verify customer is notified.",
				type_: "functional", priority: "critical", automationStatus: "full",
				automationFramework: "Playwright", automationRef: "apps/web-e2e/src/payments/refund.spec.ts",
				tags: []string{"smoke", "money", "P0"}, jiraKeys: "JIRA-204,JIRA-220",
				steps: []stepSpec{
					{"Open a paid invoice.", "Refund button visible to manager role."},
					{"Click Refund and confirm.", "Charge is refunded; status 'Refunded'."},
					{"Check email log.", "Customer receives refund confirmation."},
				},
			},
			{
				title: "Partial refund on a parameterized payment", description: "Issue a partial refund across instruments.",
				type_: "regression", priority: "high", automationStatus: "not_automated",
				tags: []string{"money", "regression"},
				steps: []stepSpec{
					{"Open a {{method}} payment of {{amount}}.", "Refund modal shows refundable {{amount}}."},
					{"Refund {{partial}}.", "Status changes to 'Partially refunded'."},
				},
				parameters: []string{"method", "amount", "partial"},
				dataRows: []dataRowSpec{
					{label: "card_50_of_200", values: map[string]string{"method": "credit card", "amount": "$200", "partial": "$50"}},
					{label: "ach_25_of_75", values: map[string]string{"method": "ACH", "amount": "$75", "partial": "$25"}},
					{label: "wire_500_of_1000", values: map[string]string{"method": "wire", "amount": "$1,000", "partial": "$500"}},
				},
			},
			{
				title: "Refund disabled for already-refunded payment", description: "Don't allow double refunds.",
				type_: "regression", priority: "medium", automationStatus: "not_automated",
				tags: []string{"edge-case"},
				steps: []stepSpec{
					{"Open a refunded invoice.", "Refund button is disabled with tooltip."},
				},
			},
		},
		"Payment methods": {
			{
				title: "Add a new credit card", description: "Customer adds a new card to their account.",
				type_: "smoke", priority: "high", automationStatus: "full",
				automationFramework: "Playwright", automationRef: "apps/web-e2e/src/payments/add-card.spec.ts",
				tags: []string{"smoke", "happy-path"},
				steps: []stepSpec{
					{"Open settings → Payment methods.", "Saved cards list renders."},
					{"Click 'Add card', enter test card.", "Card is tokenized; modal closes."},
					{"Verify card appears in the list.", "Card visible with last-4 and brand."},
				},
			},
			{
				title: "Remove the last payment method blocks active subscriptions", description: "Don't strand subscribers with no method.",
				type_: "regression", priority: "high", automationStatus: "not_automated",
				tags: []string{"edge-case", "money"},
				steps: []stepSpec{
					{"Account has only one saved method and an active subscription.", "Remove button shows warning."},
					{"Confirm remove.", "Removal blocked with explanatory error."},
				},
			},
		},
		"Sign in": {
			{
				title: "Sign in with email and password", description: "Standard login.",
				type_: "smoke", priority: "critical", automationStatus: "full",
				automationFramework: "Cypress", automationRef: "apps/web-e2e/src/auth/login.cy.ts",
				tags: []string{"smoke", "auth", "P0", "happy-path"},
				steps: []stepSpec{
					{"Visit /login.", "Login form renders with email + password."},
					{"Enter valid creds and submit.", "Redirected to dashboard."},
				},
			},
			{
				title: "Sign in with SSO (Google) succeeds", description: "OIDC happy path.",
				type_: "integration", priority: "high", automationStatus: "partial",
				automationFramework: "Cypress", automationRef: "apps/web-e2e/src/auth/sso.cy.ts",
				tags: []string{"auth", "happy-path"},
				steps: []stepSpec{
					{"Click 'Sign in with Google'.", "Provider consent screen appears."},
					{"Approve.", "Redirected back; signed-in."},
				},
			},
			{
				title: "Lockout after 5 invalid attempts", description: "Brute-force protection.",
				type_: "security", priority: "high", automationStatus: "not_automated",
				tags: []string{"auth", "edge-case"},
				steps: []stepSpec{
					{"Submit 5 wrong passwords in a row.", "Account is locked for 10 minutes."},
				},
			},
		},
		"Account recovery": {
			{
				title: "Forgot password sends a magic link", description: "Forgot-password happy path.",
				type_: "functional", priority: "high", automationStatus: "not_automated",
				tags: []string{"auth"},
				steps: []stepSpec{
					{"From /login, click 'Forgot password'.", "Email entry form appears."},
					{"Submit email.", "Confirmation message + email arrives."},
					{"Click link in email.", "Reset form opens."},
				},
			},
		},
		"MFA": {
			{
				title: "Enroll TOTP authenticator", description: "Add a TOTP authenticator and confirm with a code.",
				type_: "functional", priority: "high", automationStatus: "not_automated",
				tags: []string{"auth", "regression"},
				steps: []stepSpec{
					{"Open Security → Add authenticator.", "QR code shown."},
					{"Scan with authenticator app and submit code.", "MFA enabled."},
				},
			},
			{
				title: "Sign in with MFA across factor types", description: "Verify each enabled factor signs the user in.",
				type_: "regression", priority: "high", automationStatus: "not_automated",
				tags: []string{"auth", "regression"},
				steps: []stepSpec{
					{"Sign in with email/password.", "Prompted for {{factor}}."},
					{"Provide valid {{factor}}.", "Signed in."},
				},
				parameters: []string{"factor"},
				dataRows: []dataRowSpec{
					{label: "totp", values: map[string]string{"factor": "TOTP code"}},
					{label: "recovery_code", values: map[string]string{"factor": "recovery code"}},
				},
			},
		},
		"Booking flow": {
			{
				title: "Book a 30-minute slot from a public booking page", description: "External user books an appointment.",
				type_: "functional", priority: "critical", automationStatus: "partial",
				automationFramework: "Playwright", automationRef: "apps/web-e2e/src/calendar/book.spec.ts",
				tags: []string{"smoke", "happy-path", "calendar-ui", "P0"},
				steps: []stepSpec{
					{"Open the public booking page URL.", "Available slots render."},
					{"Pick a 30-minute slot.", "Form prompts for name + email."},
					{"Submit.", "Confirmation page shows; calendar event created."},
				},
			},
			{
				title: "Booking page handles full-day-blocked correctly", description: "All slots blocked → empty state.",
				type_: "exploratory", priority: "low", automationStatus: "not_automated",
				tags: []string{"edge-case", "calendar-ui"},
				steps: []stepSpec{
					{"Block all hours for the day under test.", "Booking page shows 'No availability'."},
				},
			},
		},
		"Recurring events": {
			{
				title: "Create a weekly recurring event", description: "Recurring schedule across weeks.",
				type_: "functional", priority: "high", automationStatus: "not_automated",
				tags: []string{"calendar-ui"},
				steps: []stepSpec{
					{"Create event with weekly recurrence and 4 occurrences.", "All 4 occurrences appear on the calendar."},
				},
			},
			{
				title: "Editing one occurrence does not break the series", description: "Per-occurrence override.",
				type_: "regression", priority: "medium", automationStatus: "not_automated",
				tags: []string{"calendar-ui", "regression"},
				steps: []stepSpec{
					{"Edit a single occurrence and change time.", "Only that occurrence is changed."},
					{"Verify other occurrences are unchanged.", "Series still consistent."},
				},
			},
		},
		"Reminders": {
			{
				title: "Email reminder sends 1 hour before event", description: "Reminder timing.",
				type_: "integration", priority: "medium", automationStatus: "not_automated",
				tags: []string{"calendar-ui"},
				steps: []stepSpec{
					{"Schedule event with 1-hour email reminder.", "Email queued at scheduled minus 1h."},
					{"Advance the test clock to T-1h.", "Email is sent."},
				},
			},
		},
		"Profile": {
			{
				title: "Update display name persists across sessions", description: "Profile update sticks.",
				type_: "functional", priority: "medium", automationStatus: "full",
				automationFramework: "Playwright", automationRef: "apps/web-e2e/src/account/profile.spec.ts",
				tags: []string{"happy-path"},
				steps: []stepSpec{
					{"Edit display name and save.", "Name updates in header."},
					{"Sign out and sign in.", "Name still updated."},
				},
			},
		},
		"Notifications prefs": {
			{
				title: "Toggle email notifications off and verify", description: "Honor opt-out.",
				type_: "functional", priority: "low", automationStatus: "not_automated",
				tags: []string{"regression"},
				steps: []stepSpec{
					{"Disable 'Booking reminders' email.", "Setting persists; toggle stays off after refresh."},
					{"Trigger a booking event.", "No email is sent for that event."},
				},
			},
		},
	}
}

func internalCasesData() map[string][]caseSpec {
	return map[string][]caseSpec{
		"Revenue report": {
			{
				title: "Daily revenue report renders for selected date", description: "Internal report — pick a date, verify totals.",
				type_: "functional", priority: "high", automationStatus: "not_automated",
				tags: []string{"regression"},
				steps: []stepSpec{
					{"Open reports → Daily revenue.", "Date picker defaults to yesterday."},
					{"Pick a known date with revenue.", "Totals match recorded test data."},
				},
			},
		},
		"Customer search": {
			{
				title: "Search customer by email returns matches", description: "Internal lookup tool.",
				type_: "smoke", priority: "medium", automationStatus: "partial",
				automationFramework: "Cypress", automationRef: "apps/internal-e2e/src/ops/search.cy.ts",
				tags: []string{"smoke"},
				steps: []stepSpec{
					{"Open Ops → Customer search.", "Search box renders."},
					{"Enter known email and submit.", "Customer card shows."},
				},
			},
		},
		"Refund tooling": {
			{
				title: "Manual refund requires manager role", description: "RBAC.",
				type_: "security", priority: "high", automationStatus: "not_automated",
				tags: []string{"regression", "auth"},
				steps: []stepSpec{
					{"Sign in as ops user (no manager role).", "Refund button is hidden."},
					{"Sign in as manager user.", "Refund button is visible and clickable."},
				},
			},
		},
	}
}
