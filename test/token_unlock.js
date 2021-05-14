const { expectRevert, BN, constants } = require('@openzeppelin/test-helpers');//time
const { expect } = require('chai');

const _require = require('app-root-path').require;

const {$AMPL, timeForwardInSec, executeEmptyBlock,
  checkAmplAprox, checkSharesAprox, log1, logRed, getBlockTimestamp, getBlockTimestampBN, getSnapshot, logMagenta, logGB, fromWei, toWei, bigNum
} = _require('/test/helper');//invokeRebase, TimeController, setTimeForNextTransaction,

const AmpleforthErc20 = artifacts.require('MockERC20');
const TokenGeyser = artifacts.require('TokenGeyser');

const ONE_YEAR = 365 * 24 * 3600;
const START_BONUS = 50;
const BONUS_PERIOD = 86400;
const InitialSharesPerToken = 10 ** 6;

let ampl, dist, owner, anotherAccount;
async function setupContractAndAccounts () {
  const accounts = await hre.ethers.getSigners();
  owner = accounts[0].address;
  anotherAccount = accounts[8].address;

  ampl = await AmpleforthErc20.new($AMPL(1000000));

  dist = await TokenGeyser.new(ampl.address, ampl.address, 10, START_BONUS, BONUS_PERIOD,
    InitialSharesPerToken);
}

async function checkAvailableToUnlock (dist, v) {
  const u = await dist.totalUnlocked.call();
  const r = await dist.updateAccounting.call();
  // console.log('Total unlocked: ', u.toString(), 'total unlocked after: ', r[1].toString());
  checkAmplAprox(r[1].sub(u), v);
}

const getBalanceLockedPool = async() => {
  const bce = await dist.totalLocked.call();
  logMagenta("balanceLockedPool: "+fromWei(bce))
  //bce.toString()
  return bce;
}

describe('LockedPool', function () {
  beforeEach('setup contracts', async function () {
    await setupContractAndAccounts();
  });

  describe('getDistributionToken', function () {
    it('should return the staking token', async function () {
      expect(await dist.getDistributionToken.call()).to.equal(ampl.address);
    });
  });

  describe('lockTokens', function () {
    describe('when not approved', function () {
      it('should fail', async function () {
        const d = await TokenGeyser.new(ampl.address, ampl.address, 5, START_BONUS, BONUS_PERIOD, InitialSharesPerToken);
        await expectRevert.unspecified(d.lockTokens($AMPL(10), ONE_YEAR));
      });
    });

    describe('when number of unlock schedules exceeds the maxUnlockSchedules', function () {
      it('should fail', async function () {
        const d = await TokenGeyser.new(ampl.address, ampl.address, 5, START_BONUS, BONUS_PERIOD, InitialSharesPerToken);
        await ampl.approve(d.address, $AMPL(100));
        await d.lockTokens($AMPL(10), ONE_YEAR);
        await d.lockTokens($AMPL(10), ONE_YEAR);
        await d.lockTokens($AMPL(10), ONE_YEAR);
        await d.lockTokens($AMPL(10), ONE_YEAR);
        await d.lockTokens($AMPL(10), ONE_YEAR);
        await expectRevert(d.lockTokens($AMPL(10), ONE_YEAR),
          'TokenGeyser: reached maximum unlock schedules');
      });
    });

    describe('when totalLocked=0', function () {
      beforeEach(async function () {
        logGB("when totalLocked=0")
        checkAmplAprox(await dist.totalLocked.call(), 0);
        await ampl.approve(dist.address, $AMPL(100));
      });
      it('should updated the locked pool balance', async function () {
        await dist.lockTokens($AMPL(100), ONE_YEAR);
        checkAmplAprox(await dist.totalLocked.call(), 100);
      });
      it('should create a schedule', async function () {
        await dist.lockTokens($AMPL(100), ONE_YEAR);
        const s = await dist.unlockSchedules.call(0);
        expect(s[0]).to.be.bignumber.equal($AMPL(100).mul(new BN(InitialSharesPerToken)));
        expect(s[1]).to.be.bignumber.equal($AMPL(0));
        expect(s[2].add(s[4])).to.be.bignumber.equal(s[3]);
        expect(s[4]).to.be.bignumber.equal(`${ONE_YEAR}`);
        expect(await dist.unlockScheduleCount.call()).to.be.bignumber.equal('1');
      });
      it('should log TokensLocked', async function () {
        const r = await dist.lockTokens($AMPL(100), ONE_YEAR);
        const l = r.logs.filter(l => l.event === 'TokensLocked')[0];
        checkAmplAprox(l.args.amount, 100);
        checkAmplAprox(l.args.total, 100);
        expect(l.args.durationSec).to.be.bignumber.equal(`${ONE_YEAR}`);
      });
      it('should be protected', async function () {
        await ampl.approve(dist.address, $AMPL(100));
        await expectRevert(dist.lockTokens($AMPL(50), ONE_YEAR, { from: anotherAccount }),
          'Ownable: caller is not the owner');
        await dist.lockTokens($AMPL(50), ONE_YEAR);
      });
    });

    describe('when totalLocked>0', function () {
      beforeEach(async function () {
        logGB("when totalLocked>0")
        await ampl.approve(dist.address, $AMPL(150));
        await dist.lockTokens($AMPL(100), ONE_YEAR);
        checkAmplAprox(await dist.totalLocked.call(), 100);
      });
      it('should updated the locked and unlocked pool balance', async function () {
        //blocktimestamp
        //use hardhat to advance in time
        await timeForwardInSec(ONE_YEAR / 10);
        await dist.lockTokens($AMPL(50), ONE_YEAR);
        //blocktimestamp, check time is advanced

        checkAmplAprox(await dist.totalLocked.call(), 100 * 0.9 + 50);
      });
      it('should log TokensUnlocked and TokensLocked', async function () {
        await timeForwardInSec(ONE_YEAR / 10);
        const r = await dist.lockTokens($AMPL(50), ONE_YEAR);

        let l = r.logs.filter(l => l.event === 'TokensUnlocked')[0];
        checkAmplAprox(l.args.amount, 100 * 0.1);
        checkAmplAprox(l.args.total, 100 * 0.9);

        l = r.logs.filter(l => l.event === 'TokensLocked')[0];
        checkAmplAprox(l.args.amount, 50);
        checkAmplAprox(l.args.total, 100 * 0.9 + 50);
        expect(l.args.durationSec).to.be.bignumber.equal(`${ONE_YEAR}`);
      });
      it('should create a schedule', async function () {
        await timeForwardInSec(ONE_YEAR / 10);
        //await timeController.advanceTime(ONE_YEAR / 10);
        await dist.lockTokens($AMPL(50), ONE_YEAR);
        const s = await dist.unlockSchedules.call(1);
        // struct UnlockSchedule {
        // 0   uint256 initialLockedShares;
        // 1   uint256 unlockedShares;
        // 2   uint256 lastUnlockTimestampSec;
        // 3   uint256 endAtSec;
        // 4   uint256 durationSec;
        // }
        checkSharesAprox(s[0], $AMPL(50).mul(new BN(InitialSharesPerToken)));
        checkSharesAprox(s[1], new BN(0));
        expect(s[2].add(s[4])).to.be.bignumber.equal(s[3]);
        expect(s[4]).to.be.bignumber.equal(`${ONE_YEAR}`);
        expect(await dist.unlockScheduleCount.call()).to.be.bignumber.equal('2');
      });
    });

    //Cut1
  });

  describe('unlockTokens', function () {
    describe('single schedule', function () {
      describe('after waiting for 1/2 the duration', function () {
        beforeEach(async function () {
          logGB("unlockTokens")
          await ampl.approve(dist.address, $AMPL(100));
          await dist.lockTokens($AMPL(100), ONE_YEAR);
          await timeForwardInSec(ONE_YEAR / 2);
        });

        describe('when supply is unchanged', function () {
          it('should unlock 1/2 the tokens', async function () {
            await executeEmptyBlock();
            expect(await dist.totalLocked.call()).to.be.bignumber.equal($AMPL(100));
            expect(await dist.totalUnlocked.call()).to.be.bignumber.equal($AMPL(0));
            await checkAvailableToUnlock(dist, 50);
          });
          it('should transfer tokens to unlocked pool', async function () {
            await dist.updateAccounting();
            checkAmplAprox(await dist.totalLocked.call(), 50);
            checkAmplAprox(await dist.totalUnlocked.call(), 50);
            await checkAvailableToUnlock(dist, 0);
          });
          it('should log TokensUnlocked and update state', async function () {
            const r = await dist.updateAccounting();
            const l = r.logs.filter(l => l.event === 'TokensUnlocked')[0];
            checkAmplAprox(l.args.amount, 50);
            checkAmplAprox(l.args.total, 50);
            const s = await dist.unlockSchedules(0);
            expect(s[0]).to.be.bignumber.equal($AMPL(100).mul(new BN(InitialSharesPerToken)));
            checkSharesAprox(s[1], $AMPL(50).mul(new BN(InitialSharesPerToken)));
          });
        });

        //Cut2
      });

      describe('after waiting > the duration', function () {
        beforeEach(async function () {
          logGB("after waiting > the duration")
          await ampl.approve(dist.address, $AMPL(100));
          await dist.lockTokens($AMPL(100), ONE_YEAR);
          await timeForwardInSec(2 * ONE_YEAR);
        });
        it('should unlock all the tokens', async function () {
          await checkAvailableToUnlock(dist, 100);
        });
        it('should transfer tokens to unlocked pool', async function () {
          expect(await dist.totalLocked.call()).to.be.bignumber.equal($AMPL(100));
          expect(await dist.totalUnlocked.call()).to.be.bignumber.equal($AMPL(0));
          await dist.updateAccounting();
          expect(await dist.totalLocked.call()).to.be.bignumber.equal($AMPL(0));
          checkAmplAprox(await dist.totalUnlocked.call(), 100);
          await checkAvailableToUnlock(dist, 0);
        });
        it('should log TokensUnlocked and update state', async function () {
          const r = await dist.updateAccounting();
          const l = r.logs.filter(l => l.event === 'TokensUnlocked')[0];
          checkAmplAprox(l.args.amount, 100);
          checkAmplAprox(l.args.total, 0);
          const s = await dist.unlockSchedules(0);
          expect(s[0]).to.be.bignumber.equal($AMPL(100).mul(new BN(InitialSharesPerToken)));
          expect(s[1]).to.be.bignumber.equal($AMPL(100).mul(new BN(InitialSharesPerToken)));
        });
      });

      describe('dust tokens due to division underflow', function () {
        beforeEach(async function () {
          logGB("dust tokens due to division underflow")
          await ampl.approve(dist.address, $AMPL(100));
          await dist.lockTokens($AMPL(1), 10 * ONE_YEAR);
        });
        it('should unlock all tokens', async function () {
          // 1 AMPL locked for 10 years. Almost all time passes upto the last minute.
          // 0.999999809 AMPLs are unlocked.
          // 1 minute passes, Now: all of the rest are unlocked: 191
          // before (#24): only 190 would have been unlocked and 0.000000001 AMPL would be
          // locked.
          await timeForwardInSec(10 * ONE_YEAR - 60);
          const r1 = await dist.updateAccounting();
          const l1 = r1.logs.filter(l => l.event === 'TokensUnlocked')[0];
          await timeForwardInSec(65);
          //await time.increase(65);
          const r2 = await dist.updateAccounting();
          const l2 = r2.logs.filter(l => l.event === 'TokensUnlocked')[0];
          expect(l1.args.amount.add(l2.args.amount)).to.be.bignumber.equal($AMPL(1));
        });
      });
    });

    describe('multi schedule', function () {
      beforeEach(async function () {
        logGB("multi schedule")
        //const t0 = await getBlockTimestamp();
        //logMagenta("t0: "+ t0);
        await ampl.approve(dist.address, $AMPL(200));
        await getBalanceLockedPool();

        const t1 = await getBlockTimestamp();
        logMagenta("t1: "+ t1);
        await dist.lockTokens($AMPL(100), ONE_YEAR);
        const t2 = await getBlockTimestamp();
        logMagenta("t2: "+ t2);
        await getBalanceLockedPool();

        const offset = 1;//usually between 1 and 2
        await timeForwardInSec(ONE_YEAR/2-offset);
        const t3 = await getBlockTimestamp();
        logMagenta("t3: "+ t3+", t3-t2: "+ (t3-t2)+", HALF_YEAR: "+ (ONE_YEAR / 2));
        await getBalanceLockedPool();

        await dist.lockTokens($AMPL(100), ONE_YEAR);
        const t4 = await getBlockTimestamp();
        logMagenta("t4: "+ t4+", t4-t2: "+ (t4-t2)+", HALF_YEAR: "+ (ONE_YEAR / 2));
        if((t4-t2) !== (ONE_YEAR/2)){
          logRed("Change the offset value to make t4-t2 === ONE_YEAR/2")
        }

        await getBalanceLockedPool();

        await timeForwardInSec(ONE_YEAR / 10);
      });
      it('should return the remaining unlock value', async function () {
        await getBalanceLockedPool();
        expect(await dist.totalLocked.call()).to.be.bignumber.equal($AMPL(150));
        expect(await dist.totalUnlocked.call()).to.be.bignumber.equal($AMPL(50));
        // 10 from each schedule for the period of ONE_YEAR / 10

        await checkAvailableToUnlock(dist, 20);
      });
      it('should transfer tokens to unlocked pool', async function () {
        await dist.updateAccounting();
        checkAmplAprox(await dist.totalLocked.call(), 130);
        checkAmplAprox(await dist.totalUnlocked.call(), 70);
        await checkAvailableToUnlock(dist, 0);
      });
      it('should log TokensUnlocked and update state', async function () {
        const r = await dist.updateAccounting();

        const l = r.logs.filter(l => l.event === 'TokensUnlocked')[0];
        checkAmplAprox(l.args.amount, 20);
        checkAmplAprox(l.args.total, 130);

        const s1 = await dist.unlockSchedules(0);
        checkSharesAprox(s1[0], $AMPL(100).mul(new BN(InitialSharesPerToken)));
        checkSharesAprox(s1[1], $AMPL(60).mul(new BN(InitialSharesPerToken)));
        const s2 = await dist.unlockSchedules(1);
        checkSharesAprox(s2[0], $AMPL(100).mul(new BN(InitialSharesPerToken)));
        checkSharesAprox(s2[1], $AMPL(10).mul(new BN(InitialSharesPerToken)));
      });
      it('should continue linear the unlock', async function () {
        await dist.updateAccounting();
        await timeForwardInSec(ONE_YEAR / 5);
        await dist.updateAccounting();

        checkAmplAprox(await dist.totalLocked.call(), 90);
        checkAmplAprox(await dist.totalUnlocked.call(), 110);
        await checkAvailableToUnlock(dist, 0);
        await timeForwardInSec(ONE_YEAR / 5);
        await dist.updateAccounting();

        checkAmplAprox(await dist.totalLocked.call(), 50);
        checkAmplAprox(await dist.totalUnlocked.call(), 150);
        await checkAvailableToUnlock(dist, 0);
      });
    });
  });

  describe('updateAccounting', function () {
    let _r, _t;
    beforeEach(async function () {
      logGB("updateAccounting")
      _r = await dist.updateAccounting.call({ from: owner });
      _t = await getBlockTimestampBN();
      await ampl.approve(dist.address, $AMPL(300));
      await dist.stake($AMPL(100), []);

      await dist.lockTokens($AMPL(100), ONE_YEAR);

      await timeForwardInSec(ONE_YEAR / 2);
      await dist.lockTokens($AMPL(100), ONE_YEAR);

      await timeForwardInSec(ONE_YEAR / 10);
    });

    describe('when user history does exist', async function () {
      it('should return the system state', async function () {
        const r = await dist.updateAccounting.call({ from: owner });
        const t = await getBlockTimestampBN();
        checkAmplAprox(r[0], 130);
        checkAmplAprox(r[1], 70);
        const timeElapsed = t.sub(_t);
        expect(r[2].div(new BN(100e9).mul(new BN(InitialSharesPerToken)))).to.be
          .bignumber.above(timeElapsed.sub(new BN(5))).and
          .bignumber.below(timeElapsed.add(new BN(5)));
        expect(r[3].div(new BN(100e9).mul(new BN(InitialSharesPerToken)))).to.be
          .bignumber.above(timeElapsed.sub(new BN(5))).and
          .bignumber.below(timeElapsed.add(new BN(5)));
        checkAmplAprox(r[4], 70);
        checkAmplAprox(r[4], 70);
        const delta = new BN(r[5]).sub(new BN(_r[5]));
        expect(delta).to.be
          .bignumber.above(timeElapsed.sub(new BN(1))).and
          .bignumber.below(timeElapsed.add(new BN(1)));
      });
    });

    describe('when user history does not exist', async function () {
      it('should return the system state', async function () {
        const r = await dist.updateAccounting.call({ from: constants.ZERO_ADDRESS });
        const t = await getBlockTimestampBN();
        checkAmplAprox(r[0], 130);
        checkAmplAprox(r[1], 70);
        const timeElapsed = t.sub(_t);
        expect(r[2].div(new BN(100e9).mul(new BN(InitialSharesPerToken)))).to.be.bignumber.equal('0');
        expect(r[3].div(new BN(100e9).mul(new BN(InitialSharesPerToken)))).to.be
          .bignumber.above(timeElapsed.sub(new BN(5))).and
          .bignumber.below(timeElapsed.add(new BN(5)));
        checkAmplAprox(r[4], 0);
        const delta = new BN(r[5]).sub(new BN(_r[5]));
        expect(delta).to.be
          .bignumber.above(timeElapsed.sub(new BN(1))).and
          .bignumber.below(timeElapsed.add(new BN(1)));
      });
    });
  });
});
    //--------------------== Cut1
    // describe('when totalLocked>0, rebase increases supply', function () {
    //   //const timeController = new TimeController();
    //   beforeEach(async function () {
    //     await ampl.approve(dist.address, $AMPL(150));
    //     await dist.lockTokens($AMPL(100), ONE_YEAR);
    //     //await timeController.initialize();
    //     checkAmplAprox(await dist.totalLocked.call(), 100);
    //     //await invokeRebase(ampl, 100);
    //   });
    //   it('should updated the locked pool balance', async function () {
    //     await timeForwardInSec(ONE_YEAR / 10);
    //     //await timeController.advanceTime(ONE_YEAR / 10);
    //     await dist.lockTokens($AMPL(50), ONE_YEAR);
    //     checkAmplAprox(await dist.totalLocked.call(), 50 + 200 * 0.9);
    //   });
    //   it('should updated the locked pool balance', async function () {
    //     await timeForwardInSec(ONE_YEAR / 10);
    //     //await timeController.advanceTime(ONE_YEAR / 10);
    //     await dist.lockTokens($AMPL(50), ONE_YEAR);

    //     checkAmplAprox(await dist.totalLocked.call(), 50 + 200 * 0.9);
    //   });
    //   it('should log TokensUnlocked and TokensLocked', async function () {
    //     await timeForwardInSec(ONE_YEAR / 10);
    //     //await timeController.advanceTime(ONE_YEAR / 10);
    //     const r = await dist.lockTokens($AMPL(50), ONE_YEAR);
    //     let l = r.logs.filter(l => l.event === 'TokensUnlocked')[0];
    //     checkAmplAprox(l.args.amount, 200 * 0.1);
    //     checkAmplAprox(l.args.total, 200 * 0.9);

    //     l = r.logs.filter(l => l.event === 'TokensLocked')[0];
    //     checkAmplAprox(l.args.amount, 50);
    //     checkAmplAprox(l.args.total, 50.0 + 200.0 * 0.9);
    //     expect(l.args.durationSec).to.be.bignumber.equal(`${ONE_YEAR}`);
    //   });
    //   it('should create a schedule', async function () {
    //     await timeForwardInSec(ONE_YEAR / 10);
    //     //await timeController.advanceTime(ONE_YEAR / 10);
    //     await dist.lockTokens($AMPL(50), ONE_YEAR);
    //     const s = await dist.unlockSchedules.call(1);
    //     checkSharesAprox(s[0], $AMPL(25).mul(new BN(InitialSharesPerToken)));
    //     checkSharesAprox(s[1], new BN(0));
    //     expect(s[2].add(s[4])).to.be.bignumber.equal(s[3]);
    //     expect(s[4]).to.be.bignumber.equal(`${ONE_YEAR}`);
    //     expect(await dist.unlockScheduleCount.call()).to.be.bignumber.equal('2');
    //   });
    // });

    // describe('when totalLocked>0, rebase decreases supply', function () {
    //   let currentTime;
    //   beforeEach(async function () {
    //     await ampl.approve(dist.address, $AMPL(150));
    //     await dist.lockTokens($AMPL(100), ONE_YEAR);
    //     currentTime = await getBlockTimestampBN();
    //await time.latest();
    //     checkAmplAprox(await dist.totalLocked.call(), 100);
    //     //await invokeRebase(ampl, -50);
    //   });
    //   it('should updated the locked pool balance', async function () {
    //     await dist.lockTokens($AMPL(50), ONE_YEAR);
    //     checkAmplAprox(await dist.totalLocked.call(), 100);
    //   });
    //   it('should log TokensUnlocked and TokensLocked', async function () {
    //     currentTime = currentTime.add(new BN(ONE_YEAR / 10));
    //     await setTimeForNextTransaction(currentTime);
    //     const r = await dist.lockTokens($AMPL(50), ONE_YEAR);
    //     let l = r.logs.filter(l => l.event === 'TokensUnlocked')[0];
    //     checkAmplAprox(l.args.amount, 50 * 0.1);
    //     checkAmplAprox(l.args.total, 50 * 0.9);

    //     l = r.logs.filter(l => l.event === 'TokensLocked')[0];
    //     checkAmplAprox(l.args.amount, 50);
    //     checkAmplAprox(l.args.total, 50 * 0.9 + 50);
    //     expect(l.args.durationSec).to.be.bignumber.equal(`${ONE_YEAR}`);
    //   });
    //   it('should create a schedule', async function () {
    //     await dist.lockTokens($AMPL(50), ONE_YEAR);
    //     const s = await dist.unlockSchedules.call(1);

    //     checkSharesAprox(s[0], $AMPL(100).mul(new BN(InitialSharesPerToken)));
    //     expect(s[1]).to.be.bignumber.equal($AMPL(0));
    //     expect(s[2].add(s[4])).to.be.bignumber.equal(s[3]);
    //     expect(s[4]).to.be.bignumber.equal(`${ONE_YEAR}`);
    //     expect(await dist.unlockScheduleCount.call()).to.be.bignumber.equal('2');
    //   });
    // });

    //----------------==Cut2
        // describe('when rebase increases supply', function () {
        //   beforeEach(async function () {
        //     //await invokeRebase(ampl, 100);
        //   });
        //   it('should unlock 1/2 the tokens', async function () {
        //     await executeEmptyBlock();
        //     //await timeController.executeEmptyBlock();
        //     expect(await dist.totalLocked.call()).to.be.bignumber.equal($AMPL(200));
        //     expect(await dist.totalUnlocked.call()).to.be.bignumber.equal($AMPL(0));
        //     await checkAvailableToUnlock(dist, 100);
        //   });
        //   it('should transfer tokens to unlocked pool', async function () {
        //     // printStatus(dist);
        //     await dist.updateAccounting();

        //     checkAmplAprox(await dist.totalLocked.call(), 100);
        //     checkAmplAprox(await dist.totalUnlocked.call(), 100);
        //     await checkAvailableToUnlock(dist, 0);
        //   });
        // });

        // describe('when rebase decreases supply', function () {
        //   beforeEach(async function () {
        //     //await invokeRebase(ampl, -50);
        //   });
        //   it('should unlock 1/2 the tokens', async function () {
        //     expect(await dist.totalLocked.call()).to.be.bignumber.equal($AMPL(50));
        //     await checkAvailableToUnlock(dist, 25);
        //   });
        //   it('should transfer tokens to unlocked pool', async function () {
        //     expect(await dist.totalLocked.call()).to.be.bignumber.equal($AMPL(50));
        //     expect(await dist.totalUnlocked.call()).to.be.bignumber.equal($AMPL(0));
        //     await dist.updateAccounting();

        //     checkAmplAprox(await dist.totalLocked.call(), 25);
        //     checkAmplAprox(await dist.totalUnlocked.call(), 25);
        //     await checkAvailableToUnlock(dist, 0);
        //   });
        // });