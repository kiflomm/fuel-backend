## Product Design Document

### Product Name

Mekelle Fuel Tracker

### Product Goal

Mekelle Fuel Tracker is a controlled fuel distribution platform designed to improve fairness, transparency, and efficiency in fuel access. The system connects government administrators, fuel stations, station workers, and vehicle owners through a centralized digital workflow.

The platform focuses on:

- controlled account creation
- quota-based fuel distribution
- payment before queue booking
- digital queue management
- station-level transaction processing
- visibility for both government and vehicle owners

---

### Core Product Rules

- Only Government Admin can create station accounts and vehicle owner accounts.
- A vehicle owner account may contain one or more registered vehicles.
- Vehicle owners cannot self-register.
- Vehicle owners can log in and view their information, but cannot edit their profile.
- Payment must be completed before a vehicle owner joins a queue.
- A queue booking is only allowed if the vehicle owner has valid quota and successful payment.
- Station workers only verify service by scanning and completing transactions.

---

### User Roles and Features

### Government Admin

Government Admin is the highest authority in the system and controls user onboarding, policy settings, and overall monitoring.

Features:

- Create and manage station manager accounts
- Create and manage vehicle owner accounts
- Register one or more vehicles under a vehicle owner during account creation
- Create and manage station records
- Set and adjust fuel distribution rules by vehicle category
- Define daily, weekly, or monthly quota limits
- Apply emergency or manual quota overrides when necessary
- View system-wide analytics
- View fuel distribution by station, vehicle type, and time period
- Generate daily, weekly, and monthly reports
- Broadcast announcements to stations and vehicle owners
- Activate, suspend, or deactivate accounts and stations

### Station Manager

Station Manager is responsible for the operation of a specific station and the management of station workers.

Features:

- Create and manage station worker accounts
- View and monitor the live queue for the station
- Pause queue intake for the station
- Resume queue intake for the station
- Update station fuel availability status
- View station transaction history
- View daily station totals and service activity

### Station Worker

Station Worker handles service-point verification and transaction completion.

Features:

- Scan vehicle owner QR code to verify queue booking
- View basic booking and owner verification details
- Confirm that fuel service has been provided
- Complete transaction and trigger quota deduction
- View transaction confirmation result

### Vehicle Owner

Vehicle Owner is the end user who receives fuel access through the platform.

Features:

- Log in to the mobile application
- View personal account information
- View registered vehicles under the account
- View quota status for each vehicle
- View available stations and live queue lengths
- Join a virtual queue after successful payment
- Track queue position in real time
- Receive notification when turn is approaching
- View transaction history and receipts

---

### Main User Flow

### 1. Account and Vehicle Registration

- Government Admin creates station manager accounts
- Government Admin creates vehicle owner accounts
- During vehicle owner registration, the admin can assign one or more vehicles to that owner

### 2. Policy and Quota Setup

- Government Admin defines fuel quota rules based on vehicle category
- The system stores quota eligibility and limits for each registered vehicle

### 3. Queue Booking

- Vehicle owner logs in to the mobile app
- Vehicle owner checks stations and live queue lengths
- Vehicle owner selects a station
- Vehicle owner makes payment
- If payment succeeds and quota is valid, the owner joins the queue

### 4. Fuel Service

- Vehicle owner arrives at the station
- Station worker scans the owner QR code
- System verifies the queue booking
- Station worker confirms service completion
- System records the transaction and deducts quota

### 5. Monitoring and Reporting

- Station Manager monitors station activity and queue intake
- Government Admin monitors system-wide operations and reports

---

### Key Business Rules

- Government Admin is the only role allowed to create station and vehicle owner accounts.
- A vehicle owner can have multiple vehicles under one account.
- Payment is a required step before queue joining provided valid remaining quota. 
- Station Manager can pause or resume queue intake at station level.
- Station Worker can only handle service verification and transaction completion.

---

### Suggested Backend Modules

- auth
- users
- vehicles
- stations
- quotas
- payments
- queues
- transactions
- notifications
- reports

---

### Important Notes for Implementation

- The relationship between vehicle owner and vehicles should be one-to-many.
- Queue booking should be linked to both payment status and quota validation.
- Station worker permissions should remain minimal in the current scope.
- Audit logging should still be considered later, even if suspicious-case reporting is not in scope now.
