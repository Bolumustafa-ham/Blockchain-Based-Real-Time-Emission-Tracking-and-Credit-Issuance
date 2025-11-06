# EcoTrack: Blockchain-Based Real-Time Emission Tracking and Credit Issuance

## Overview

EcoTrack is a Web3 project built on the Stacks blockchain using Clarity smart contracts. It enables real-time tracking of industrial emissions through sensor oracles and automates the issuance of carbon credits. By leveraging blockchain's transparency and immutability, EcoTrack addresses real-world problems like inaccurate emission reporting, fraud in carbon markets, and lack of incentives for emission reductions. Industries can integrate sensors to report data verifiably, earning credits for meeting targets, which can be traded or redeemed. This promotes sustainability, regulatory compliance, and a decentralized carbon economy.

Key features:
- Real-time emission data ingestion from industrial IoT sensors acting as oracles.
- Automated verification and credit issuance based on predefined thresholds.
- Transparent auditing and trading of credits.
- Integration with external oracles for data validation.

The project solves:
- **Climate Change Mitigation**: Accurate, tamper-proof tracking encourages emission reductions.
- **Regulatory Compliance**: Helps companies meet standards like EU ETS or California's cap-and-trade.
- **Fraud Prevention**: Blockchain ensures data integrity, reducing greenwashing.
- **Economic Incentives**: Tokenized credits create a market for eco-friendly practices.

## Architecture

EcoTrack consists of 6 core smart contracts written in Clarity, deployed on Stacks (Bitcoin-secured layer). These contracts handle data ingestion, verification, credit issuance, trading, governance, and oracle management. The system uses STX as the native token for transactions, with a custom ERC-20-like token (ECO) for credits.

### Smart Contracts

1. **OracleRegistry.clar**  
   Manages registration and authentication of sensor oracles. Oracles (industrial sensors) must register with unique IDs and public keys. Handles oracle staking (in STX) to ensure reliability and penalizes faulty reporting.  
   - Functions: `register-oracle`, `validate-oracle`, `slash-stake`.  
   - Traits: Implements oracle trait for data submission.

2. **EmissionTracker.clar**  
   Tracks real-time emission data submitted by registered oracles. Stores historical data in maps, calculates aggregates (e.g., daily/monthly totals), and emits events for off-chain monitoring.  
   - Functions: `submit-emission-data`, `get-emission-history`, `calculate-aggregate`.  
   - Data Structures: Maps for timestamped emissions per entity.

3. **CreditIssuer.clar**  
   Automates issuance of ECO credits based on emission thresholds. References rules from Governance contract. Verifies data from EmissionTracker and mints credits if targets are met (e.g., below X tons CO2).  
   - Functions: `issue-credits`, `verify-threshold`, `mint-eco`.  
   - Integrates with Token contract for minting.

4. **EcoToken.clar**  
   A fungible token contract for ECO credits (SIP-010 compliant). Handles minting, burning, transferring, and balance queries. Credits represent verified emission reductions.  
   - Functions: `transfer`, `mint`, `burn`, `get-balance`.  
   - Total Supply: Dynamic, based on issuances.

5. **Marketplace.clar**  
   Decentralized exchange for trading ECO credits. Allows listing, buying, and selling with STX or other assets. Includes escrow for secure trades.  
   - Functions: `list-credit`, `buy-credit`, `cancel-listing`.  
   - Ensures only verified credits can be traded.

6. **Governance.clar**  
   Manages system parameters like emission thresholds, credit multipliers, and oracle requirements. Uses a DAO-like voting mechanism with ECO holders.  
   - Functions: `propose-change`, `vote-on-proposal`, `execute-proposal`.  
   - Data Structures: Maps for proposals and votes.

## Tech Stack

- **Blockchain**: Stacks (Layer 1 with Bitcoin security).
- **Smart Contract Language**: Clarity (secure, decidable language).
- **Off-Chain Components**: Node.js oracle adapters for sensor data (not included in this repo; example scripts provided).
- **Tools**: Clarinet for local development and testing.

## Installation

1. Install Clarinet:  
   ```
   curl -L https://clarinet.stacks.co/install | sh
   ```

2. Clone the repo:  
   cd ecotrack
   ```

3. Initialize Clarinet project:  
   ```
   clarinet new .
   ```

4. Copy the contract files from `/contracts` into your Clarinet project.

## Deployment

1. Set up a Stacks wallet and fund it with STX (testnet or mainnet).

2. Deploy contracts using Clarinet:  
   ```
   clarinet deploy --testnet  # or --mainnet
   ```

   Deployment order:  
   - OracleRegistry  
   - EmissionTracker  
   - EcoToken  
   - CreditIssuer (depends on Tracker and Token)  
   - Marketplace (depends on Token)  
   - Governance (depends on all)

3. Register oracles via off-chain scripts connecting sensors to the blockchain.

## Usage

### Submitting Emission Data
Oracles call `submit-emission-data` on EmissionTracker with signed data (e.g., CO2 levels, timestamp).

### Issuing Credits
Periodically, call `issue-credits` on CreditIssuer for an entity; it checks data and mints ECO.

### Trading
Use Marketplace to list and buy ECO tokens.

### Governance
ECO holders propose and vote on changes, e.g., updating thresholds.

## Testing

Run unit tests with Clarinet:  
```
clarinet test
```

Tests cover:
- Oracle registration and data submission.
- Credit issuance logic.
- Token transfers and marketplace trades.
- Governance voting.

## Security Considerations

- Clarity's predictability prevents reentrancy and overflow issues.
- Oracles stake STX to deter malicious behavior.
- All data submissions are signed and verified.
- Audits recommended before mainnet deployment.

## Roadmap

- Integrate with real IoT platforms (e.g., AWS IoT).
- Add NFT-based certificates for major milestones.
- Cross-chain bridges for ECO tokens.
- Mobile app for monitoring.


## License

MIT License. See LICENSE file for details.