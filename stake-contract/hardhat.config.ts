import hardhatToolboxMochaEthersPlugin from "@nomicfoundation/hardhat-toolbox-mocha-ethers";
import { configVariable, defineConfig } from "hardhat/config";
import HardhatIgnitionEthersPlugin from "@nomicfoundation/hardhat-ignition-ethers";
//import hardhatKeystore from "@nomicfoundation/hardhat-keystore";
import * as dotenv from "dotenv";
dotenv.config();

// 获取所有以 PRIVATE_KEY_ 开头的环境变量
const privateKeys = Object.keys(process.env)
  .filter(key => key.startsWith('PRIVATE_KEY_') && process.env[key])
  .sort()  // 确保顺序是 PRIVATE_KEY_1, PRIVATE_KEY_2, ...
  .map(key => process.env[key] as string);

const sepoliaPrivateKeys = Object.keys(process.env)
  .filter(key => key.startsWith('SEPOLIA_PRIVATE_KEY_') && process.env[key])
  .sort()  //
  .map(key => process.env[key] as string);

export default defineConfig({
  plugins: [hardhatToolboxMochaEthersPlugin, HardhatIgnitionEthersPlugin],
  solidity: {
    profiles: {
      default: {
        version: "0.8.28",
      },
      production: {
        version: "0.8.28",
        settings: {
          optimizer: {
            enabled: true,
            runs: 200,
          },
        },
      },
    },
    npmFilesToBuild: [
      "@openzeppelin/contracts/proxy/ERC1967/ERC1967Proxy.sol"
    ],
  },
  networks: {
    hardhatMainnet: {
      type: "edr-simulated",
      chainType: "l1",
    },
    hardhatOp: {
      type: "edr-simulated",
      chainType: "op",
    },
    localhost: {
      type: "http",
      url: process.env.RPC_URL || "http://127.0.0.1:8545",
      //accounts: process.env.PRIVATE_KEY_1 ? [process.env.PRIVATE_KEY_1] : [],
      accounts: privateKeys,
    },
    sepolia: {
      type: "http",
      chainType: "l1",
      url: process.env.SEPOLIA_RPC_URL || "",
      //accounts: [configVariable("SEPOLIA_PRIVATE_KEY")],
      accounts: sepoliaPrivateKeys,
      gasPrice: 20000000000,
      gas: 2100000,
      timeout: 60000, // 增加超时时间
      chainId: 11155111,
    },
  },
  verify: {
    etherscan: {
      apiKey: process.env.ETHERSCAN_API_KEY || "",
      enabled: true,
    },
    blockscout: {
      enabled: false,
    },
    sourcify: {
      enabled: false,
    },
  }
});