import { expect } from "chai";
import hre from "hardhat";

describe("MetaNodeStakeTest", function () {
    let ethers: any;
    let stake: any;
    let proxy: any;
    let metanode: any;
    let usdc: any;

    let admin: any;
    let user1: any;
    let user2: any;

    let metaNodePerBlock = 100n   //每区块奖励
    let blockHight = 10000        // 区块高度
    let unstakeLockedBlocks = 10  // 解除质押的锁定区块数

    async function deployAuctionFixture({ ethers }: any) {
        //建立网络连接，获取签名账户
        [admin, user1, user2] = await ethers.getSigners();

        // 部署 MetaNode 合约
        const metaNodeFactory = await ethers.getContractFactory("MetaNode")
        metanode = await metaNodeFactory.deploy()

        // 起始区块
        const startBlock = await ethers.provider.getBlockNumber()

        //部属 MetaNodeStake 合约，编码初始化数据
        const MetaNodeStakeFactory = await ethers.getContractFactory("MetaNodeStake");
        const impl = await MetaNodeStakeFactory.deploy();
        const initdata = impl.interface.encodeFunctionData("initialize",
            [
                await metanode.getAddress(),
                startBlock,
                startBlock + blockHight,
                metaNodePerBlock
            ]
        );

        //部属代理合约
        const UUPSUpgradeableFactory = await ethers.getContractFactory("ERC1967Proxy");
        proxy = await UUPSUpgradeableFactory.deploy(
            await impl.getAddress(),
            initdata
        );

        //连接代理合约到实现合约
        stake = MetaNodeStakeFactory.attach(await proxy.getAddress());

        //部属usdc代币合约
        const TestERC20Factory = await ethers.getContractFactory("TestERC20");
        usdc = await TestERC20Factory.deploy("USDC", "USDC", ethers.parseUnits("1000000", 18));

        const blockNumber = await ethers.provider.getBlockNumber()
        console.log("当前区块高度:", blockNumber)
        console.log("终止区块高度:", startBlock + blockHight)

        return {
            ethers,
            stake,
            proxy,
            metanode,
            usdc,
            admin,
            user1,
            user2
        };
    }

    beforeEach(async function () {
        const { networkHelpers } = await hre.network.create();
        ({
            ethers,
            stake,
            proxy,
            metanode,
            usdc,
            admin,
            user1,
            user2
        } = await networkHelpers.loadFixture(deployAuctionFixture));
    });

    //测试重复初始化报错
    describe("initialize", function () {
        it("should fail when initialized twice", async function () {
            const blockNumber = await ethers.provider.getBlockNumber()
            await expect(stake.connect(admin).initialize(
                await metanode.getAddress(),
                blockNumber,
                blockNumber + blockHight,
                metaNodePerBlock))
                .to.be.revertedWithCustomError(stake, "InvalidInitialization");
        });
    });

    //测试新增质押池
    describe("addPool", function () {
        it("should increment pool", async function () {
            await stake.connect(admin).addPool(ethers.ZeroAddress, 5, 1E15, unstakeLockedBlocks, false)
            expect(await stake.poolLength()).to.equal(1)
            const pool1 = await stake.pool(0)
            expect(pool1.stTokenAddress).to.equal(ethers.ZeroAddress)
            expect(await stake.totalPoolWeight()).to.equal(pool1.poolWeight)

            await stake.connect(admin).addPool(await usdc.getAddress(), 10, BigInt(1E18), unstakeLockedBlocks, false)
            expect(await stake.poolLength()).to.be.equal(2)
            const pool2 = await stake.pool(1)
            expect(pool2.stTokenAddress).to.equal(await usdc.getAddress())
            expect(await stake.totalPoolWeight()).to.equal(pool1.poolWeight + pool2.poolWeight)
        });
    });

    //测试Withdraw和Claim状态改变
    describe("pause and unpause", function () {
        it("should change the state of Withdraw or Claim", async function () {
            await stake.connect(admin).pauseWithdraw()
            await stake.connect(admin).pauseClaim()
            expect(await stake.withdrawPaused()).to.be.true
            expect(await stake.claimPaused()).to.be.true

            await stake.connect(admin).unpauseWithdraw()
            await stake.connect(admin).unpauseClaim()
            expect(await stake.withdrawPaused()).to.be.false
            expect(await stake.claimPaused()).to.be.false
        });
    });

    //测试更改每区块奖励
    describe("setMetaNodePerBlock", function () {
        it("should change metaNodePerBlock", async function () {
            //更改前metaNodePerBlock
            const MetaNodePerBlockBefore = await stake.MetaNodePerBlock()
            console.log("MetaNodePerBlockBefore: ", MetaNodePerBlockBefore)

            await stake.connect(admin).setMetaNodePerBlock(200)
            
            //更改后metaNodePerBlock
            const MetaNodePerBlockAfter = await stake.MetaNodePerBlock()
            console.log("MetaNodePerBlockAfter: ", MetaNodePerBlockAfter)

            expect(MetaNodePerBlockAfter).to.not.equal(MetaNodePerBlockBefore)
        });
    });

    //测试startBlock和endBlock设置
    describe("setBlock", function () {
        it("should change startblock", async function () {
            //更改前startblock
            const startBlockBefore = await stake.startBlock()
            console.log("startBlockBefore: ", startBlockBefore)

            await stake.connect(admin).setStartBlock(5)

            //更改后startblock
            const startBlockAfter = await stake.startBlock()
            console.log("startBlockAfter: ", startBlockAfter)

            const endblock = await stake.endBlock()

            expect(startBlockAfter).to.below(endblock)
            expect(startBlockAfter).to.not.equal(startBlockBefore)
        });

        it("should change endblock", async function () {
            const startblock = await stake.startBlock()
            const blockNumber = startblock + 20000n
            console.log("终止区块高度:", blockNumber)
            await stake.connect(admin).setEndBlock(blockNumber)
            const endblock = await stake.endBlock()

            expect(startblock).to.below(endblock)
            expect(endblock).to.equal(blockNumber)
        });
    })

    //测试更新池子信息
    describe("updatePool", function () {
        it("should update pool info", async function () {
            await stake.connect(admin).addPool(ethers.ZeroAddress, 5, 1E15, unstakeLockedBlocks, false)
            const pool1Before = await stake.pool(0)
            const minAmountBefore = pool1Before.minDepositAmount
            const unstakeBlocksBefore = pool1Before.unstakeLockedBlocks

            await stake.connect(admin).updatePool(0, BigInt(1E16), 5)
            const pool1After = await stake.pool(0)
            expect(pool1After.minDepositAmount).to.not.equal(minAmountBefore)
            expect(pool1After.minDepositAmount).to.equal(BigInt(1E16))
            expect(pool1After.unstakeLockedBlocks).to.not.equal(unstakeBlocksBefore)
            expect(pool1After.unstakeLockedBlocks).to.equal(5)
        });

        it("should update Pool Weight", async function () {
            await stake.connect(admin).addPool(ethers.ZeroAddress, 5, 1E15, unstakeLockedBlocks, false)
            const pool1Before = await stake.pool(0)
            const totalWeightBefore = await stake.totalPoolWeight()

            await stake.connect(admin).setPoolWeight(0, 20, true)
            const pool1After = await stake.pool(0)
            expect(pool1After.poolWeight).to.not.equal(pool1Before.poolWeight)
            expect(pool1After.poolWeight).to.equal(20)
            expect(await stake.totalPoolWeight()).to.not.equal(totalWeightBefore)
            expect(await stake.totalPoolWeight()).to.equal(20)
        });
    })

    //测试getMultiplier
    describe("getMultiplier", function () {
        it("should correct get Multiplier", async function () {
            await stake.connect(admin).setStartBlock(10)
            await stake.connect(admin).addPool(ethers.ZeroAddress, 5, 1E15, unstakeLockedBlocks, false)
            const fromblock = await ethers.provider.getBlockNumber()
            const startblock = await stake.startBlock()
            console.log("当前区块：", fromblock)
            console.log("起始区块：", startblock)
            
            const toblock = startblock + 20000n
            const endblock = await stake.endBlock()
            const mul = await stake.getMultiplier(fromblock, toblock)
            expect(mul).to.equal((BigInt(endblock) - BigInt(startblock)) * metaNodePerBlock)
        });
    })

    //测试deposit
    describe("deposit", function () {
        it("should successful deposit", async () => {
            //增加ETH和USDC质押池
            await stake.connect(admin).addPool(ethers.ZeroAddress, 5, 1E15, unstakeLockedBlocks, true)
            await stake.connect(admin).addPool(await usdc.getAddress(), 10, BigInt(1E18), unstakeLockedBlocks, true)

            //存入ETH
            await stake.connect(user1).depositETH({ value: ethers.parseEther("10") })
            await stake.connect(user2).depositETH({ value: ethers.parseEther("20") })
            const user1ETHStake = await stake.stakingBalance(0, user1.address)
            const user2ETHStake = await stake.stakingBalance(0, user2.address)
            expect(user1ETHStake).to.equal(BigInt(10E18))
            expect(user2ETHStake).to.equal(BigInt(20E18))

            //存入usdc
            await usdc.connect(admin).transfer(user1.address, ethers.parseUnits("10000", 18))
            await usdc.connect(user1).approve(await stake.getAddress(), ethers.parseUnits("100", 18))
            await stake.connect(user1).deposit(1, ethers.parseUnits("100", 18))
            const user1USDCStake = await stake.stakingBalance(1, user1.address)
            expect(user1USDCStake).to.equal(BigInt(100E18))
        });

        it("should successful deposit again", async () => {
            //增加ETH质押池
            await stake.connect(admin).addPool(ethers.ZeroAddress, 5, 1E15, unstakeLockedBlocks, true)

            //存入ETH
            await stake.connect(user1).depositETH({ value: ethers.parseEther("10") })

            //再次存入ETH
            await stake.connect(user1).depositETH({ value: ethers.parseEther("10") })
            const user1ETHStake = await stake.stakingBalance(0, user1.address)
            expect(user1ETHStake).to.equal(BigInt(20E18))
        });
    })

    //测试unstake
    describe("unstake", function () {
        it("should correct unstake", async () => {
            //增加ETH和USDC质押池
            await stake.connect(admin).addPool(ethers.ZeroAddress, 5, 1E15, unstakeLockedBlocks, true)
            await stake.connect(admin).addPool(await usdc.getAddress(), 10, BigInt(1E18), unstakeLockedBlocks, true)

            //存入ETH
            await stake.connect(user1).depositETH({ value: ethers.parseEther("10") })
            await stake.connect(user2).depositETH({ value: ethers.parseEther("20") })

            //存入usdc
            await usdc.connect(admin).transfer(user1.address, ethers.parseUnits("10000", 18))
            await usdc.connect(user1).approve(await stake.getAddress(), ethers.parseUnits("100", 18))
            await stake.connect(user1).deposit(1, ethers.parseUnits("100", 18))

            //解质押
            await stake.connect(user1).unstake(0, ethers.parseEther("2"))
            await stake.connect(user2).unstake(0, ethers.parseEther("2"))
            await stake.connect(user1).unstake(1, ethers.parseUnits("20", 18))

            const user1ETHstake = await stake.stakingBalance(0, user1.address)
            const user2ETHstake = await stake.stakingBalance(0, user2.address)
            const user1USDCstake = await stake.stakingBalance(1, user1.address)
            const pool1 = await stake.pool(0)
            const pool2 = await stake.pool(1)
            expect(user1ETHstake).to.equal(BigInt(8E18))
            expect(user2ETHstake).to.equal(BigInt(18E18))
            expect(user1USDCstake).to.equal(BigInt(80E18))
            expect(pool1.stTokenAmount).to.equal(BigInt(26E18))
            expect(pool2.stTokenAmount).to.equal(BigInt(80E18))
        });
    })

    //测试withdrawAmount
    describe("withdrawAmount", function () {
        it("should correct withdrawAmount", async () => {
            //增加ETH质押池
            await stake.connect(admin).addPool(ethers.ZeroAddress, 5, 1E15, unstakeLockedBlocks, true)

            //存入ETH
            await stake.connect(user1).depositETH({ value: ethers.parseEther("10") })

            //解质押第1次，解锁区块为17
            await stake.connect(user1).unstake(0, ethers.parseEther("2"))
            const blockNumber1 = await ethers.provider.getBlockNumber()
            console.log("blockNumber1: ", blockNumber1)
            console.log("unlockedBlock1: ", blockNumber1 + unstakeLockedBlocks)

            //解质押第2次，解锁区块为18
            await stake.connect(user1).unstake(0, ethers.parseEther("2"))
            const blockNumber2 = await ethers.provider.getBlockNumber()
            console.log("blockNumber2: ", blockNumber2)
            console.log("unlockedBlock2: ", blockNumber2 + unstakeLockedBlocks)

            //解质押第3次，解锁区块为19
            await stake.connect(user1).unstake(0, ethers.parseEther("2"))
            const blockNumber3 = await ethers.provider.getBlockNumber()
            console.log("blockNumber3: ", blockNumber3)
            console.log("unlockedBlock3: ", blockNumber3 + unstakeLockedBlocks)

            //挖8个区块，使第一次解质押的数量到达解锁区块
            for (let i = 0; i < 8; i++) {
                await ethers.provider.send("evm_mine");
            }

            //获取可提现数量
            const [requestAmount,pendingWithdrawAmount] = await stake.withdrawAmount(0, user1.address)
            expect(requestAmount).to.equal(BigInt(6E18))
            expect(pendingWithdrawAmount).to.equal(BigInt(2E18))
        });
    })

    //测试withdraw
    describe("withdraw", function () {
        it("should correct withdraw", async () => {
            //增加ETH和USDC质押池
            await stake.connect(admin).addPool(ethers.ZeroAddress, 5, 1E15, unstakeLockedBlocks, true)
            await stake.connect(admin).addPool(await usdc.getAddress(), 10, BigInt(1E18), unstakeLockedBlocks, true)

            //存入ETH
            await stake.connect(user1).depositETH({ value: ethers.parseEther("10") })

            //存入usdc
            await usdc.connect(admin).transfer(user1.address, ethers.parseUnits("10000", 18))
            await usdc.connect(user1).approve(await stake.getAddress(), ethers.parseUnits("100", 18))
            await stake.connect(user1).deposit(1, ethers.parseUnits("100", 18))

            //ETH解质押第1次，解锁区块为21
            await stake.connect(user1).unstake(0, ethers.parseEther("2"))
            const blockNumber1 = await ethers.provider.getBlockNumber()
            console.log("blockNumber1: ", blockNumber1)
            console.log("unlockedBlock1: ", blockNumber1 + unstakeLockedBlocks)

            //USDC解质押第1次，解锁区块为22
            await stake.connect(user1).unstake(1, ethers.parseUnits("20", 18))
            const USDCblockNumber1 = await ethers.provider.getBlockNumber()
            console.log("USDCblockNumber1: ", USDCblockNumber1)
            console.log("USDCunlockedBlock1: ", USDCblockNumber1 + unstakeLockedBlocks)

            //隔开两个区块
            for (let i = 0; i < 2; i++) {
                await ethers.provider.send("evm_mine");
            }

            //ETH解质押第2次，解锁区块为25
            await stake.connect(user1).unstake(0, ethers.parseEther("2"))
            const blockNumber2 = await ethers.provider.getBlockNumber()
            console.log("blockNumber2: ", blockNumber2)
            console.log("unlockedBlock2: ", blockNumber2 + unstakeLockedBlocks)

            //挖8个区块，使ETH和USDC第一次解质押的数量到达解锁区块
            for (let i = 0; i < 8; i++) {
                await ethers.provider.send("evm_mine");
            }

            //获取提现之前的余额
            const user1ETHBalanceBefore = await ethers.provider.getBalance(user1.address)
            const user1USDCBalanceBefore = await usdc.balanceOf(user1.address)
            console.log("user1ETHBalanceBefore: ", user1ETHBalanceBefore)
            console.log("user1USDCBalanceBefore: ", user1USDCBalanceBefore)

            //提现
            await stake.connect(user1).withdraw(0)
            await stake.connect(user1).withdraw(1)

            //获取提现后的余额
            const user1ETHBalanceAfter = await ethers.provider.getBalance(user1.address)
            const user1USDCBalanceAfter = await usdc.balanceOf(user1.address)
            console.log("user1ETHBalanceAfter: ", user1ETHBalanceAfter)
            console.log("user1USDCBalanceAfter: ", user1USDCBalanceAfter)

            expect(user1ETHBalanceAfter - user1ETHBalanceBefore).to.below(BigInt(2E18)).above(BigInt(1.9E18))
            expect(user1USDCBalanceAfter - user1USDCBalanceBefore).to.equal(BigInt(20E18))

            const [requestAmount1, pendingWithdrawAmount1] = await stake.withdrawAmount(0, user1.address);
            const [requestAmount2, pendingWithdrawAmount2] = await stake.withdrawAmount(1, user1.address);
            expect(requestAmount1).to.above(0)
            expect(requestAmount2).to.equal(0)
        });
    })

    //测试claim
    describe("claim", function () {
        it("should correct claim metanode", async () => {
            //增加ETH质押池
            await stake.connect(admin).addPool(ethers.ZeroAddress, 5, 1E15, unstakeLockedBlocks, true)

            //给stake合约转入metanode奖励代币
            await metanode.connect(admin).transfer(await stake.getAddress(), ethers.parseUnits("10000000", 18))

            //存入ETH
            await stake.connect(user1).depositETH({ value: ethers.parseEther("10") })

            //获取领取奖励之前的metanode余额
            const metanodeBalanceBefore = await metanode.balanceOf(user1.address)
            console.log("metanodeBalanceBefore: ", metanodeBalanceBefore)

            //挖10个区块
            for (let i = 0; i < 10; i++) {
                await ethers.provider.send("evm_mine");
            }

            //获取待领取的奖励数量
            const pending = await stake.pendingMetaNode(0, user1.address)
            console.log("pending: ", pending)

            //领取奖励
            await stake.connect(user1).claim(0)

            //获取领取奖励之后的metanode余额
            const metanodeBalanceAfter = await metanode.balanceOf(user1.address)
            console.log("metanodeBalanceAfter: ", metanodeBalanceAfter)

            expect(metanodeBalanceAfter - metanodeBalanceBefore).to.above(0)
        });

        it("should correct claim metanode when not enough", async () => {
            //增加ETH质押池
            await stake.connect(admin).addPool(ethers.ZeroAddress, 5, 1E15, unstakeLockedBlocks, true)

            //给stake合约转入metanode奖励代币
            await metanode.connect(admin).transfer(await stake.getAddress(), ethers.parseUnits("100", 0))

            //存入ETH
            await stake.connect(user1).depositETH({ value: ethers.parseEther("10") })

            //获取领取奖励之前的metanode余额
            const metanodeBalanceBefore = await metanode.balanceOf(user1.address)
            console.log("metanodeBalanceBefore: ", metanodeBalanceBefore)

            //挖10个区块
            for (let i = 0; i < 10; i++) {
                await ethers.provider.send("evm_mine");
            }

            //获取待领取的奖励数量
            const pending = await stake.pendingMetaNode(0, user1.address)
            console.log("pending: ", pending)

            //领取奖励
            await stake.connect(user1).claim(0)

            //获取领取奖励之后的metanode余额
            const metanodeBalanceAfter = await metanode.balanceOf(user1.address)
            console.log("metanodeBalanceAfter: ", metanodeBalanceAfter)

            expect(metanodeBalanceAfter - metanodeBalanceBefore).to.above(0)
        });
    })
})