import { task, HardhatUserConfig } from "hardhat/config";
import "@nomiclabs/hardhat-ethers";
import "@nomiclabs/hardhat-waffle";
import "@nomiclabs/hardhat-etherscan";
import { ethers } from "ethers";
require("@nomiclabs/hardhat-truffle5");
import "solidity-coverage"

require("dotenv").config();

const INFURA_PROJECT_ID = process.env.INFURA_PROJECT_ID;
const RINKEBY_PRIVATE_KEY = process.env.RINKEBY_PRIVATE_KEY;
const MAINNET_PRIVATE_KEY = process.env.MAINNET_PRIVATE_KEY;
const ETHERSCAN_API_KEY = process.env.ETHERSCAN_API_KEY;
const ALCHEMY_API_KEY = process.env.ALCHEMY_API_KEY;
const ALCHEMY_RINKEBY_KEY = process.env.ALCHEMY_RINKEBY_KEY;

const MAX_UNLOCK_SCHEDULES = 3;
const START_BONUS = 33;
const BONUS_PERIOD_SEC = 5256000;
const INITIAL_SHARES_PER_TOKEN = 1;
const LP_TOKEN_ADDRESS = "0xB48E9b22Dace65F6A2B409871e154B85f4ED8B80";
const FORCE_TOKEN_ADDRESS = "0x2c31b10ca416b82cec4c5e93c615ca851213d48d";

// This is a sample Hardhat task. To learn how to create your own go to
// https://hardhat.org/guides/create-task.html
task("accounts", "Prints the list of accounts", async (args, hre) => {
  const accounts = await hre.ethers.getSigners();

  for (const account of accounts) {
    console.log(account.address);
  }
});

task("sign-etherscan", "Signs message for etherscan", async (args, hre) => {
  const accounts = await hre.ethers.getSigners();

  for (const account of accounts) {
    console.log(
      await account.signMessage(
        "[Etherscan.io 28/04/2021 18:20:25] I, hereby verify that I am the owner/creator of the address [0x2c31b10ca416b82cec4c5e93c615ca851213d48d]"
      )
    );
  }
});

task("deploy-geyser", "Deploys new geyser contract")
  .setAction(async (args, hre) => {
    // We get the contract to deploy
    const Geyser = await hre.ethers.getContractFactory("TokenGeyser");
    const geyser = await Geyser.deploy(
        LP_TOKEN_ADDRESS,
        FORCE_TOKEN_ADDRESS,
        MAX_UNLOCK_SCHEDULES,
        START_BONUS,
        BONUS_PERIOD_SEC,
        INITIAL_SHARES_PER_TOKEN
    );

    console.log("Geyser deployed to:", geyser.address);
    console.log(
      `npx hardhat verify --contract contracts/geyser/TokenGeyser.sol:TokenGeyser --network rinkeby ${geyser.address} ${LP_TOKEN_ADDRESS} ${FORCE_TOKEN_ADDRESS} ${MAX_UNLOCK_SCHEDULES} ${START_BONUS} ${BONUS_PERIOD_SEC} ${INITIAL_SHARES_PER_TOKEN}`
    );
  });

// You need to export an object to set up your config
// Go to https://hardhat.org/config/ to learn more
/**
 * @type import('hardhat/config').HardhatUserConfig
 */
const config: HardhatUserConfig = {
  defaultNetwork: "hardhat",
  networks: {
    hardhat: {},
    rinkeby: {
      url: `https://rinkeby.infura.io/v3/${INFURA_PROJECT_ID}`,
      accounts: [`0x${RINKEBY_PRIVATE_KEY}`],
      gasPrice: ethers.utils.parseUnits("200", "gwei").toNumber(),
    },
    mainnet: {
      url: `https://mainnet.infura.io/v3/${INFURA_PROJECT_ID}`,
      accounts: [`0x${MAINNET_PRIVATE_KEY}`],
      gasPrice: ethers.utils.parseUnits("110", "gwei").toNumber(),
    },
    ganache: {
      url: "http://127.0.0.1:8545",
    },
  },
  etherscan: {
    apiKey: ETHERSCAN_API_KEY,
  },
  solidity: "0.8.0",
  mocha: {
    timeout: 2000000,
  },
};

export default config;
