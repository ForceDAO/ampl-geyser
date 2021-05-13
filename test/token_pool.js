const { expectRevert, expectEvent, constants} = require('@openzeppelin/test-helpers');
const { ZERO_ADDRESS } = constants;

const { expect } = require('chai');

const MockERC20 = artifacts.require('MockERC20');
const TokenPool = artifacts.require('TokenPool');

let token, otherToken, tokenPool, owner, other, anotherAccount;
describe('tokenPool', function () {
  beforeEach('setup contracts', async function () {
    const accounts = await hre.ethers.getSigners();
    owner = accounts[0].address;
    other = accounts[1].address;
    anotherAccount = accounts[8].address;

    token = await MockERC20.new(1000);
    otherToken = await MockERC20.new(2000);

    tokenPool = await TokenPool.new(token.address);
  });
  
  it('has an owner', async function () {
    expect(await tokenPool.owner()).to.equal(owner);
  });
  describe('Ownable: transfer ownership', function () {
    it('changes owner after transfer', async function () {
      const receipt = await tokenPool.transferOwnership(other, { from: owner });
      expectEvent(receipt, 'OwnershipTransferred');

      expect(await tokenPool.owner()).to.equal(other);
    });

    it('prevents non-owners from transferring', async function () {
      await expectRevert(
        tokenPool.transferOwnership(other, { from: other }),
        'Ownable: caller is not the owner',
      );
    });

    it('guards ownership against stuck state', async function () {
      await expectRevert(
        tokenPool.transferOwnership(ZERO_ADDRESS, { from: owner }),
        'Ownable: new owner is the zero address',
      );
    });
  });

  describe('Ownable: renounce ownership', function () {
    it('loses owner after renouncement', async function () {
      const receipt = await tokenPool.renounceOwnership({ from: owner });
      expectEvent(receipt, 'OwnershipTransferred');

      expect(await tokenPool.owner()).to.equal(ZERO_ADDRESS);
    });

    it('prevents non-owners from renouncement', async function () {
      await expectRevert(
        tokenPool.renounceOwnership({ from: other }),
        'Ownable: caller is not the owner',
      );
    });
  });

  describe('balance', function() {
    it('should return the balance of the token pool', async function(){
      await token.transfer(tokenPool.address, 123);
      expect(await tokenPool.balance.call()).to.be.bignumber.equal('123');
      await tokenPool.transfer(owner, 99);
      expect(await tokenPool.balance.call()).to.be.bignumber.equal('24');
      await tokenPool.transfer(owner, 24);
      expect(await tokenPool.balance.call()).to.be.bignumber.equal('0');
    });
  });

  describe('transfer', function() {
    it('should let the owner transfer funds out', async function(){
      await token.transfer(tokenPool.address, 1000);

      expect(await tokenPool.balance.call()).to.be.bignumber.equal('1000');
      expect(await token.balanceOf.call(anotherAccount)).to.be.bignumber.equal('0');

      await tokenPool.transfer(anotherAccount, 1000);

      expect(await tokenPool.balance.call()).to.be.bignumber.equal('0');
      expect(await token.balanceOf.call(anotherAccount)).to.be.bignumber.equal('1000');
    });

    it('should NOT let other users transfer funds out', async function(){
      await token.transfer(tokenPool.address, 1000);
      await expectRevert(
        tokenPool.transfer(anotherAccount, 1000, { from: anotherAccount }),
        'Ownable: caller is not the owner'
      );
    });
  });

  describe('rescueFunds', function() {
    beforeEach(async function(){
      await token.transfer(tokenPool.address, 1000);
      await otherToken.transfer(tokenPool.address, 2000);

      expect(await tokenPool.balance.call()).to.be.bignumber.equal('1000');
      expect(await token.balanceOf.call(anotherAccount)).to.be.bignumber.equal('0');
      expect(await otherToken.balanceOf.call(tokenPool.address)).to.be.bignumber.equal('2000');
      expect(await otherToken.balanceOf.call(anotherAccount)).to.be.bignumber.equal('0');
    });

    it('should let owner users claim excess funds completely', async function(){
      await tokenPool.rescueFunds(otherToken.address, anotherAccount, 2000);

      expect(await tokenPool.balance.call()).to.be.bignumber.equal('1000');
      expect(await token.balanceOf.call(anotherAccount)).to.be.bignumber.equal('0');
      expect(await otherToken.balanceOf.call(tokenPool.address)).to.be.bignumber.equal('0');
      expect(await otherToken.balanceOf.call(anotherAccount)).to.be.bignumber.equal('2000');
    });

    it('should let owner users claim excess funds partially', async function(){
      await tokenPool.rescueFunds(otherToken.address, anotherAccount, 777);

      expect(await tokenPool.balance.call()).to.be.bignumber.equal('1000');
      expect(await token.balanceOf.call(anotherAccount)).to.be.bignumber.equal('0');
      expect(await otherToken.balanceOf.call(tokenPool.address)).to.be.bignumber.equal('1223');
      expect(await otherToken.balanceOf.call(anotherAccount)).to.be.bignumber.equal('777');
    });

    it('should NOT let owner claim more than available excess funds', async function(){
      await expectRevert(
        tokenPool.rescueFunds(otherToken.address, anotherAccount, 2001),
        'ERC20: transfer amount exceeds balance'
      );
    });

    it('should NOT let owner users claim held funds', async function(){
      await expectRevert(
        tokenPool.rescueFunds(token.address, anotherAccount, 1000),
        'TokenPool: Cannot claim token held by the contract'
      );
    });

    it('should NOT let other users users claim excess funds', async function(){
      await expectRevert(
        tokenPool.rescueFunds(otherToken.address, anotherAccount, 2000, { from: anotherAccount }),
        'Ownable: caller is not the owner'
      );
    });
  });
});
