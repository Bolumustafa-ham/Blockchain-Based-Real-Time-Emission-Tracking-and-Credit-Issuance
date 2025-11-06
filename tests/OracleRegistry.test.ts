import { describe, it, expect, beforeEach } from "vitest";
import { stringUtf8CV, uintCV, bufferCV } from "@stacks/transactions";

const ERR_NOT_AUTHORIZED = 100;
const ERR_INVALID_NAME = 101;
const ERR_INVALID_PUBLIC_KEY = 102;
const ERR_INSUFFICIENT_STAKE = 103;
const ERR_ORACLE_ALREADY_EXISTS = 104;
const ERR_ORACLE_NOT_FOUND = 105;
const ERR_INVALID_STAKE_AMOUNT = 106;
const ERR_MAX_ORACLES_EXCEEDED = 107;
const ERR_SLASH_NOT_AUTHORIZED = 108;
const ERR_ORACLE_NOT_ACTIVE = 109;
const ERR_AUTHORITY_NOT_VERIFIED = 110;
const ERR_INVALID_STATUS = 111;
const ERR_INVALID_TIMESTAMP = 112;
const ERR_INVALID_UPDATE_PARAM = 113;
const ERR_SLASH_AMOUNT_EXCEEDS_STAKE = 114;

interface Oracle {
  name: string;
  owner: string;
  publicKey: Buffer;
  stake: number;
  status: boolean;
  timestamp: number;
  lastValidation: number;
}

interface OracleUpdate {
  updateName: string | null;
  updatePublicKey: Buffer | null;
  updateTimestamp: number;
  updater: string;
}

interface Result<T> {
  ok: boolean;
  value: T;
}

class OracleRegistryMock {
  state: {
    nextOracleId: number;
    maxOracles: number;
    minStake: number;
    registrationFee: number;
    authorityContract: string | null;
    oracles: Map<number, Oracle>;
    oracleUpdates: Map<number, OracleUpdate>;
    oraclesByName: Map<string, number>;
  } = {
    nextOracleId: 0,
    maxOracles: 500,
    minStake: 10000,
    registrationFee: 500,
    authorityContract: null,
    oracles: new Map(),
    oracleUpdates: new Map(),
    oraclesByName: new Map(),
  };
  blockHeight: number = 0;
  caller: string = "ST1TEST";
  authorities: Set<string> = new Set(["ST1TEST"]);
  stxTransfers: Array<{ amount: number; from: string; to: string | null }> = [];
  stakeLocks: Array<{ owner: string; amount: number }> = [];
  stakeReleases: Array<{ owner: string; amount: number }> = [];

  constructor() {
    this.reset();
  }

  reset() {
    this.state = {
      nextOracleId: 0,
      maxOracles: 500,
      minStake: 10000,
      registrationFee: 500,
      authorityContract: null,
      oracles: new Map(),
      oracleUpdates: new Map(),
      oraclesByName: new Map(),
    };
    this.blockHeight = 0;
    this.caller = "ST1TEST";
    this.authorities = new Set(["ST1TEST"]);
    this.stxTransfers = [];
    this.stakeLocks = [];
    this.stakeReleases = [];
  }

  isVerifiedAuthority(principal: string): Result<boolean> {
    return { ok: true, value: this.authorities.has(principal) };
  }

  setAuthorityContract(contractPrincipal: string): Result<boolean> {
    if (contractPrincipal === "SP000000000000000000002Q6VF78") {
      return { ok: false, value: false };
    }
    if (this.state.authorityContract !== null) {
      return { ok: false, value: false };
    }
    this.state.authorityContract = contractPrincipal;
    return { ok: true, value: true };
  }

  setMaxOracles(newMax: number): Result<boolean> {
    if (!this.state.authorityContract) return { ok: false, value: false };
    if (newMax <= 0) return { ok: false, value: false };
    this.state.maxOracles = newMax;
    return { ok: true, value: true };
  }

  setMinStake(newMin: number): Result<boolean> {
    if (!this.state.authorityContract) return { ok: false, value: false };
    if (newMin <= 0) return { ok: false, value: false };
    this.state.minStake = newMin;
    return { ok: true, value: true };
  }

  setRegistrationFee(newFee: number): Result<boolean> {
    if (!this.state.authorityContract) return { ok: false, value: false };
    if (newFee < 0) return { ok: false, value: false };
    this.state.registrationFee = newFee;
    return { ok: true, value: true };
  }

  lockStake(owner: string, amount: number): Result<boolean> {
    this.stakeLocks.push({ owner, amount });
    return { ok: true, value: true };
  }

  releaseStake(owner: string, amount: number): Result<boolean> {
    this.stakeReleases.push({ owner, amount });
    return { ok: true, value: true };
  }

  registerOracle(
    name: string,
    publicKey: Buffer,
    stakeAmount: number
  ): Result<number> {
    if (this.state.nextOracleId >= this.state.maxOracles) return { ok: false, value: ERR_MAX_ORACLES_EXCEEDED };
    if (!name || name.length > 50) return { ok: false, value: ERR_INVALID_NAME };
    if (publicKey.length !== 33) return { ok: false, value: ERR_INVALID_PUBLIC_KEY };
    if (stakeAmount < this.state.minStake) return { ok: false, value: ERR_INSUFFICIENT_STAKE };
    if (this.state.oraclesByName.has(name)) return { ok: false, value: ERR_ORACLE_ALREADY_EXISTS };
    if (!this.state.authorityContract) return { ok: false, value: ERR_AUTHORITY_NOT_VERIFIED };
    this.stxTransfers.push({ amount: this.state.registrationFee, from: this.caller, to: this.state.authorityContract });
    this.lockStake(this.caller, stakeAmount);
    const id = this.state.nextOracleId;
    const oracle: Oracle = {
      name,
      owner: this.caller,
      publicKey,
      stake: stakeAmount,
      status: true,
      timestamp: this.blockHeight,
      lastValidation: this.blockHeight,
    };
    this.state.oracles.set(id, oracle);
    this.state.oraclesByName.set(name, id);
    this.state.nextOracleId++;
    return { ok: true, value: id };
  }

  getOracle(id: number): Oracle | null {
    return this.state.oracles.get(id) || null;
  }

  getOracleByOwner(owner: string): Oracle | null {
    for (const [id, oracle] of this.state.oracles.entries()) {
      if (oracle.owner === owner) {
        return oracle;
      }
    }
    return null;
  }

  updateOracle(id: number, updateName: string | null, updatePublicKey: Buffer | null): Result<boolean> {
    const oracle = this.state.oracles.get(id);
    if (!oracle) return { ok: false, value: ERR_ORACLE_NOT_FOUND };
    if (oracle.owner !== this.caller) return { ok: false, value: ERR_NOT_AUTHORIZED };
    if (updateName && (updateName.length === 0 || updateName.length > 50)) return { ok: false, value: ERR_INVALID_NAME };
    if (updatePublicKey && updatePublicKey.length !== 33) return { ok: false, value: ERR_INVALID_PUBLIC_KEY };
    if (updateName) {
      const existing = this.state.oraclesByName.get(updateName);
      if (existing && existing !== id) {
        return { ok: false, value: ERR_ORACLE_ALREADY_EXISTS };
      }
    }
    if (updateName && updateName !== oracle.name) {
      this.state.oraclesByName.delete(oracle.name);
      this.state.oraclesByName.set(updateName, id);
    }
    const updated: Oracle = {
      ...oracle,
      name: updateName || oracle.name,
      publicKey: updatePublicKey || oracle.publicKey,
      timestamp: this.blockHeight,
    };
    this.state.oracles.set(id, updated);
    this.state.oracleUpdates.set(id, {
      updateName: updateName,
      updatePublicKey: updatePublicKey,
      updateTimestamp: this.blockHeight,
      updater: this.caller,
    });
    return { ok: true, value: true };
  }

  validateOracle(id: number): Result<boolean> {
    const oracle = this.state.oracles.get(id);
    if (!oracle) return { ok: false, value: ERR_ORACLE_NOT_FOUND };
    if (!oracle.status) return { ok: false, value: ERR_ORACLE_NOT_ACTIVE };
    const updated: Oracle = {
      ...oracle,
      lastValidation: this.blockHeight,
    };
    this.state.oracles.set(id, updated);
    return { ok: true, value: true };
  }

  slashOracleStake(id: number, slashAmount: number): Result<boolean> {
    const oracle = this.state.oracles.get(id);
    if (!oracle) return { ok: false, value: ERR_ORACLE_NOT_FOUND };
    if (!this.state.authorityContract) return { ok: false, value: ERR_AUTHORITY_NOT_VERIFIED };
    if (slashAmount > oracle.stake) return { ok: false, value: ERR_SLASH_AMOUNT_EXCEEDS_STAKE };
    if (!oracle.status) return { ok: false, value: ERR_ORACLE_NOT_ACTIVE };
    const currentStake = oracle.stake - slashAmount;
    const updated: Oracle = {
      ...oracle,
      stake: currentStake,
      status: currentStake > 0,
    };
    this.state.oracles.set(id, updated);
    this.releaseStake(oracle.owner, slashAmount);
    return { ok: true, value: true };
  }

  revokeOracle(id: number): Result<boolean> {
    const oracle = this.state.oracles.get(id);
    if (!oracle) return { ok: false, value: ERR_ORACLE_NOT_FOUND };
    if (oracle.owner !== this.caller) return { ok: false, value: ERR_NOT_AUTHORIZED };
    const updated: Oracle = {
      ...oracle,
      status: false,
    };
    this.state.oracles.set(id, updated);
    return { ok: true, value: true };
  }

  getOracleCount(): Result<number> {
    return { ok: true, value: this.state.nextOracleId };
  }

  checkOracleExistence(name: string): Result<boolean> {
    return { ok: true, value: this.state.oraclesByName.has(name) };
  }
}

describe("OracleRegistry", () => {
  let contract: OracleRegistryMock;

  beforeEach(() => {
    contract = new OracleRegistryMock();
    contract.reset();
  });

  it("registers an oracle successfully", () => {
    contract.setAuthorityContract("ST2TEST");
    const pubKey = Buffer.from("02f9e4046b7b289c83d16bbe456885c6f4a9a928f9c2b8d89d0a21c4a9165d91f4", "hex");
    const result = contract.registerOracle("SensorAlpha", pubKey, 15000);
    expect(result.ok).toBe(true);
    expect(result.value).toBe(0);
    const oracle = contract.getOracle(0);
    expect(oracle?.name).toBe("SensorAlpha");
    expect(oracle?.owner).toBe("ST1TEST");
    expect(oracle?.publicKey).toEqual(pubKey);
    expect(oracle?.stake).toBe(15000);
    expect(oracle?.status).toBe(true);
    expect(oracle?.timestamp).toBe(0);
    expect(oracle?.lastValidation).toBe(0);
    expect(contract.stxTransfers).toEqual([{ amount: 500, from: "ST1TEST", to: "ST2TEST" }]);
    expect(contract.stakeLocks).toEqual([{ owner: "ST1TEST", amount: 15000 }]);
  });

  it("rejects duplicate oracle names", () => {
    contract.setAuthorityContract("ST2TEST");
    const pubKey = Buffer.from("02f9e4046b7b289c83d16bbe456885c6f4a9a928f9c2b8d89d0a21c4a9165d91f4", "hex");
    contract.registerOracle("SensorAlpha", pubKey, 15000);
    const result = contract.registerOracle("SensorAlpha", pubKey, 20000);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_ORACLE_ALREADY_EXISTS);
  });

  it("rejects registration without authority contract", () => {
    const pubKey = Buffer.from("02f9e4046b7b289c83d16bbe456885c6f4a9a928f9c2b8d89d0a21c4a9165d91f4", "hex");
    const result = contract.registerOracle("NoAuth", pubKey, 15000);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_AUTHORITY_NOT_VERIFIED);
  });

  it("rejects insufficient stake", () => {
    contract.setAuthorityContract("ST2TEST");
    const pubKey = Buffer.from("02f9e4046b7b289c83d16bbe456885c6f4a9a928f9c2b8d89d0a21c4a9165d91f4", "hex");
    const result = contract.registerOracle("LowStake", pubKey, 5000);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_INSUFFICIENT_STAKE);
  });

  it("rejects invalid public key length", () => {
    contract.setAuthorityContract("ST2TEST");
    const shortKey = Buffer.from("02f9e4046b7b289c83d16bbe456885c6f4a9a928f9c2b8d89d0a21c4a9165d91f", "hex");
    const result = contract.registerOracle("InvalidKey", shortKey, 15000);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_INVALID_PUBLIC_KEY);
  });

  it("rejects invalid name length", () => {
    contract.setAuthorityContract("ST2TEST");
    const longName = "A".repeat(51);
    const pubKey = Buffer.from("02f9e4046b7b289c83d16bbe456885c6f4a9a928f9c2b8d89d0a21c4a9165d91f4", "hex");
    const result = contract.registerOracle(longName, pubKey, 15000);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_INVALID_NAME);
  });

  it("rejects max oracles exceeded", () => {
    contract.setAuthorityContract("ST2TEST");
    contract.state.maxOracles = 1;
    const pubKey = Buffer.from("02f9e4046b7b289c83d16bbe456885c6f4a9a928f9c2b8d89d0a21c4a9165d91f4", "hex");
    contract.registerOracle("First", pubKey, 15000);
    const result = contract.registerOracle("Second", pubKey, 15000);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_MAX_ORACLES_EXCEEDED);
  });

  it("updates an oracle successfully", () => {
    contract.setAuthorityContract("ST2TEST");
    const pubKey = Buffer.from("02f9e4046b7b289c83d16bbe456885c6f4a9a928f9c2b8d89d0a21c4a9165d91f4", "hex");
    const newPubKey = Buffer.from("03f9e4046b7b289c83d16bbe456885c6f4a9a928f9c2b8d89d0a21c4a9165d91f4", "hex");
    contract.registerOracle("OldSensor", pubKey, 15000);
    const result = contract.updateOracle(0, "NewSensor", newPubKey);
    expect(result.ok).toBe(true);
    expect(result.value).toBe(true);
    const oracle = contract.getOracle(0);
    expect(oracle?.name).toBe("NewSensor");
    expect(oracle?.publicKey).toEqual(newPubKey);
    const update = contract.state.oracleUpdates.get(0);
    expect(update?.updateName).toBe("NewSensor");
    expect(update?.updatePublicKey).toEqual(newPubKey);
    expect(update?.updater).toBe("ST1TEST");
  });

  it("rejects update for non-existent oracle", () => {
    contract.setAuthorityContract("ST2TEST");
    const result = contract.updateOracle(99, "NewSensor", null);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_ORACLE_NOT_FOUND);
  });

  it("rejects update by non-owner", () => {
    contract.setAuthorityContract("ST2TEST");
    const pubKey = Buffer.from("02f9e4046b7b289c83d16bbe456885c6f4a9a928f9c2b8d89d0a21c4a9165d91f4", "hex");
    contract.registerOracle("TestSensor", pubKey, 15000);
    contract.caller = "ST3FAKE";
    const result = contract.updateOracle(0, "NewSensor", null);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_NOT_AUTHORIZED);
  });

  it("validates an active oracle successfully", () => {
    contract.setAuthorityContract("ST2TEST");
    const pubKey = Buffer.from("02f9e4046b7b289c83d16bbe456885c6f4a9a928f9c2b8d89d0a21c4a9165d91f4", "hex");
    contract.registerOracle("ActiveSensor", pubKey, 15000);
    contract.blockHeight = 10;
    const result = contract.validateOracle(0);
    expect(result.ok).toBe(true);
    expect(result.value).toBe(true);
    const oracle = contract.getOracle(0);
    expect(oracle?.lastValidation).toBe(10);
  });

  it("rejects validation for inactive oracle", () => {
    contract.setAuthorityContract("ST2TEST");
    const pubKey = Buffer.from("02f9e4046b7b289c83d16bbe456885c6f4a9a928f9c2b8d89d0a21c4a9165d91f4", "hex");
    contract.registerOracle("InactiveSensor", pubKey, 15000);
    contract.revokeOracle(0);
    const result = contract.validateOracle(0);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_ORACLE_NOT_ACTIVE);
  });

  it("rejects slash exceeding stake", () => {
    contract.setAuthorityContract("ST2TEST");
    contract.authorities.add("ST2TEST");
    contract.caller = "ST2TEST";
    const pubKey = Buffer.from("02f9e4046b7b289c83d16bbe456885c6f4a9a928f9c2b8d89d0a21c4a9165d91f4", "hex");
    contract.registerOracle("OverSlash", pubKey, 15000);
    const result = contract.slashOracleStake(0, 20000);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_SLASH_AMOUNT_EXCEEDS_STAKE);
  });

  it("revokes an oracle successfully", () => {
    contract.setAuthorityContract("ST2TEST");
    const pubKey = Buffer.from("02f9e4046b7b289c83d16bbe456885c6f4a9a928f9c2b8d89d0a21c4a9165d91f4", "hex");
    contract.registerOracle("Revokable", pubKey, 15000);
    const result = contract.revokeOracle(0);
    expect(result.ok).toBe(true);
    expect(result.value).toBe(true);
    const oracle = contract.getOracle(0);
    expect(oracle?.status).toBe(false);
  });

  it("rejects revoke by non-owner", () => {
    contract.setAuthorityContract("ST2TEST");
    const pubKey = Buffer.from("02f9e4046b7b289c83d16bbe456885c6f4a9a928f9c2b8d89d0a21c4a9165d91f4", "hex");
    contract.registerOracle("NotRevokable", pubKey, 15000);
    contract.caller = "ST3FAKE";
    const result = contract.revokeOracle(0);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(ERR_NOT_AUTHORIZED);
  });

  it("returns correct oracle count", () => {
    contract.setAuthorityContract("ST2TEST");
    const pubKey = Buffer.from("02f9e4046b7b289c83d16bbe456885c6f4a9a928f9c2b8d89d0a21c4a9165d91f4", "hex");
    contract.registerOracle("One", pubKey, 15000);
    contract.registerOracle("Two", pubKey, 15000);
    const result = contract.getOracleCount();
    expect(result.ok).toBe(true);
    expect(result.value).toBe(2);
  });

  it("checks oracle existence correctly", () => {
    contract.setAuthorityContract("ST2TEST");
    const pubKey = Buffer.from("02f9e4046b7b289c83d16bbe456885c6f4a9a928f9c2b8d89d0a21c4a9165d91f4", "hex");
    contract.registerOracle("Exists", pubKey, 15000);
    let result = contract.checkOracleExistence("Exists");
    expect(result.ok).toBe(true);
    expect(result.value).toBe(true);
    result = contract.checkOracleExistence("NonExists");
    expect(result.ok).toBe(true);
    expect(result.value).toBe(false);
  });

  it("gets oracle by owner correctly", () => {
    contract.setAuthorityContract("ST2TEST");
    const pubKey = Buffer.from("02f9e4046b7b289c83d16bbe456885c6f4a9a928f9c2b8d89d0a21c4a9165d91f4", "hex");
    contract.registerOracle("OwnerSensor", pubKey, 15000);
    const oracle = contract.getOracleByOwner("ST1TEST");
    expect(oracle?.name).toBe("OwnerSensor");
    expect(oracle?.owner).toBe("ST1TEST");
  });

  it("sets min stake successfully", () => {
    contract.setAuthorityContract("ST2TEST");
    const result = contract.setMinStake(20000);
    expect(result.ok).toBe(true);
    expect(result.value).toBe(true);
    expect(contract.state.minStake).toBe(20000);
  });

  it("rejects min stake set without authority", () => {
    const result = contract.setMinStake(20000);
    expect(result.ok).toBe(false);
    expect(result.value).toBe(false);
  });

  it("sets authority contract successfully", () => {
    const result = contract.setAuthorityContract("ST2TEST");
    expect(result.ok).toBe(true);
    expect(result.value).toBe(true);
    expect(contract.state.authorityContract).toBe("ST2TEST");
  });

  it("rejects invalid authority contract", () => {
    const result = contract.setAuthorityContract("SP000000000000000000002Q6VF78");
    expect(result.ok).toBe(false);
    expect(result.value).toBe(false);
  });
});