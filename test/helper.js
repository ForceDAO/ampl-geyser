const { BN } = require('@openzeppelin/test-helpers');
const { promisify } = require('util');
const { time } = require('@openzeppelin/test-helpers');
const { web3 } = require('@openzeppelin/test-environment');
const { expect } = require('chai');

//--------------------==
const { ethers } = require("hardhat");
const { BigNumber } = require("ethers");
const chalk = require('chalk');

const bigNum = (item) => BigNumber.from(item);
const DECIMALS18 = 18;
const amt = (amount) => bigNum(amount).pow(DECIMALS18);
const log1 = console.log;

const logRed = (text) => console.log(chalk.red(text))
const logGreen = (text) => console.log(chalk.green(text))
const logMagenta = (text) => console.log(chalk.magentaBright(text))
const logCyan = (text) => console.log(chalk.cyanBright(text))
const logWB = (text) => console.log(chalk.white.bgBlue.bold(text))
const logGB = (text) => console.log(chalk.green.bgBlue.bold(text))

//--------------------==
const PERC_DECIMALS = 2;
const AMPL_DECIMALS = 9;

function $AMPL (x) {
  return new BN(x * (10 ** AMPL_DECIMALS));
}

// Perc has to be a whole number
async function invokeRebase (ampl, perc) {
  const s = await ampl.totalSupply.call();
  const ordinate = 10 ** PERC_DECIMALS;
  const p_ = new BN(parseInt(perc * ordinate)).div(new BN(100));
  const s_ = s.mul(p_).div(new BN(ordinate));
  await ampl.rebase(1, s_);
}

function checkAmplAprox (x, y) {
  checkAprox(x, $AMPL(y), 10 ** 6);
}

function checkSharesAprox (x, y) {
  checkAprox(x, y, 10 ** 12);
}

function checkAprox (x, y, delta_) {
  const delta = new BN(parseInt(delta_));
  const upper = y.add(delta);
  const lower = y.sub(delta);
  expect(x).to.be.bignumber.at.least(lower).and.bignumber.at.most(upper);
}
//--------------------==
const fromWeiE = (weiAmount, dp = AMPL_DECIMALS) => {
  try {
    return ethers.utils.formatUnits(weiAmount.toString(), parseInt(dp));
  } catch (err) {
    console.error("fromWeiE() failed:", err);
    return -1;
  }
}//input: BN or string, dp = 6 or 18 number, output: string

const toWeiE = (amount, dp = AMPL_DECIMALS) => {
  try {
    return ethers.utils.parseUnits(amount.toString(), parseInt(dp));
  } catch (err) {
    console.error("toWeiE() failed:", err);
    return -1;
  }
}//input: string, output: Bn

const fromWei = (weiAmount) => fromWeiE(weiAmount);
//web3.utils.fromWei(weiAmount.toString(), "ether");

const toWei = (amount) => toWeiE(amount);
//web3.utils.toWei(amount.toString(), "ether");
//--------------------==
const jsonrpc = "2.0";
const id = 0; //31337
const makeRPC = async (method, params = []) =>
  await network.provider.request({ id, jsonrpc, method, params });
//web3.currentProvider.makeRPC({ id, jsonrpc, method, params })

const timeForwardInSec = async (seconds) => {
  log1(chalk.green("\nOn Time Forward", seconds, "seconds"));
  await timeForward(seconds);
};
const getBlockTimestamp = async () => {
  const blockNum = await makeRPC("eth_blockNumber");
  const lastBlock = await makeRPC("eth_getBlockByNumber", [blockNum, true]);
  const blockTimestamp = parseInt(lastBlock.timestamp);
  log1("blockTimestamp:", blockTimestamp);
  return blockTimestamp;
};
const getBlockTimestampBN = async() => {
  const t1 = await getBlockTimestamp();
  return new BN(t1);
}

const timeForward = async (seconds) => {
  await makeRPC("evm_increaseTime", [seconds]);
  await makeRPC("evm_mine");//manually mine new blocks 
};
const setAutomine = async (isMining) => {
  await network.provider.send("evm_setAutomine", [isMining])
};
const setIntervalMining = async (intervalSeconds) => {
  await network.provider.send("evm_setIntervalMining", [intervalSeconds])
};
const getSnapshot = async () => {
  const snapshot = await network.provider.send("evm_snapshot", [])
  log1("snapshot:", snapshot)
};
const minerStop = async () => {
//{"method": "miner_stop", "params": []}
  await makeRPC("miner_stop");
};
const minerStart = async (numberOfThreads = 2) => {
//{"method": "miner_start", "params": [number]}
  await makeRPC("miner_start", [numberOfThreads]);
};

const executeAsBlock = async (Transactions) => {
  await setAutomine(false);
  Transactions();
  await setAutomine(true);
  await makeRPC("evm_mine");
}
const executeEmptyBlock = async() => {
  await makeRPC("evm_mine");//manually mine new blocks 
}
/**function advanceBlock () {
  return promisify(web3.currentProvider.send.bind(web3.currentProvider))({
    jsonrpc: '2.0',
    method: 'evm_mine',
    id: new Date().getTime(),
  });
}*/
//-----------------------==
class TimeController {
  async initialize () {
    this.currentTime = await time.latest();
  }
  async advanceTime (seconds) {
    this.currentTime = this.currentTime.add(new BN(seconds));
    await setTimeForNextTransaction(this.currentTime);
  }
  async executeEmptyBlock () {
    await time.advanceBlock();
  }
  async executeAsBlock (Transactions) {
    await this.pauseTime();
    Transactions();
    await this.resumeTime();
    await time.advanceBlock();
  }
  async pauseTime () {
    return promisify(web3.currentProvider.send.bind(web3.currentProvider))({
      jsonrpc: '2.0',
      method: 'miner_stop',
      id: new Date().getTime()
    });
  }
  async resumeTime () {
    return promisify(web3.currentProvider.send.bind(web3.currentProvider))({
      jsonrpc: '2.0',
      method: 'miner_start',
      id: new Date().getTime()
    });
  }
}

async function printMethodOutput (r) {
  console.log(r.logs);
}

async function printStatus (dist) {
  console.log('Total Locked: ', await dist.totalLocked.call().toString());
  console.log('Total UnLocked: ', await dist.totalUnlocked.call().toString());
  const c = (await dist.unlockScheduleCount.call()).toNumber();
  console.log(await dist.unlockScheduleCount.call().toString());

  for (let i = 0; i < c; i++) {
    console.log(await dist.unlockSchedules.call(i).toString());
  }
  // TODO: Print the following variables:
  // await dist.totalLocked.call()
  // await dist.totalUnlocked.call()
  // await dist.unlockScheduleCount.call()
  // dist.updateAccounting.call() // and all the logs
  // dist.unlockSchedules.call(1)
}

async function increaseTimeForNextTransaction (diff) {
  await promisify(web3.currentProvider.send.bind(web3.currentProvider))({
    jsonrpc: '2.0',
    method: 'evm_increaseTime',
    params: [diff.toNumber()],
    id: new Date().getTime()
  });
}

async function setTimeForNextTransaction (target) {
  if (!BN.isBN(target)) {
    target = new BN(target);
  }

  const now = (await time.latest());

  if (target.lt(now)) throw Error(`Cannot increase current time (${now}) to a moment in the past (${target})`);
  const diff = target.sub(now);
  increaseTimeForNextTransaction(diff);
}

module.exports = {checkAmplAprox, checkSharesAprox, invokeRebase, $AMPL, setTimeForNextTransaction,  printMethodOutput, printStatus, getBlockTimestamp,
  getBlockTimestampBN, timeForwardInSec, setAutomine, setIntervalMining
, executeAsBlock, getSnapshot, bigNum, amt, log1, executeEmptyBlock, logRed, logGreen, logWB, logGB, logMagenta, toWei, toWeiE, fromWei, fromWeiE
};//TimeController
