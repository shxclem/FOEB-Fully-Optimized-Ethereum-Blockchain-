import { expect } from "chai";
import { network } from "hardhat";

const { ethers, networkHelpers } = await network.create();

describe("EscrowManager", function () {
  const PRICE = ethers.parseEther("1");

  async function deployFixture() {
    const [seller, buyer, other] = await ethers.getSigners();
    const EscrowManager = await ethers.getContractFactory("EscrowManager");
    const escrow = await EscrowManager.deploy();
    return { escrow, seller, buyer, other };
  }

  // ---------------------------- Listings ----------------------------

  describe("Listings", function () {
    it("creates a new listing", async function () {
      const { escrow, seller } = await networkHelpers.loadFixture(deployFixture);

      await expect(escrow.connect(seller).createListing(PRICE, "ipfs://desc"))
        .to.emit(escrow, "ListingCreated")
        .withArgs(0n, seller.address, PRICE, "ipfs://desc");

      const listing = await escrow.getListing(0n);
      expect(listing.seller).to.equal(seller.address);
      expect(listing.price).to.equal(PRICE);
      expect(listing.active).to.equal(true);
    });

    it("denies creating a listing with a zero price", async function () {
      const { escrow, seller } = await networkHelpers.loadFixture(deployFixture);
      await expect(
        escrow.connect(seller).createListing(0n, "ipfs://desc"),
      ).to.be.revertedWith("price must be > 0");
    });

    it("allows the seller to cancel their listing", async function () {
      const { escrow, seller } = await networkHelpers.loadFixture(deployFixture);
      await escrow.connect(seller).createListing(PRICE, "ipfs://desc");

      await expect(escrow.connect(seller).cancelListing(0n))
        .to.emit(escrow, "ListingCancelled")
        .withArgs(0n);

      const listing = await escrow.getListing(0n);
      expect(listing.active).to.equal(false);
    });

    it("denies cancellation by anyone other than the seller", async function () {
      const { escrow, seller, buyer } = await networkHelpers.loadFixture(deployFixture);
      await escrow.connect(seller).createListing(PRICE, "ipfs://desc");

      await expect(
        escrow.connect(buyer).cancelListing(0n),
      ).to.be.revertedWithCustomError(escrow, "NotSeller");
    });

    it("denies canceling an already inactive listing", async function () {
      const { escrow, seller } = await networkHelpers.loadFixture(deployFixture);
      await escrow.connect(seller).createListing(PRICE, "ipfs://desc");
      await escrow.connect(seller).cancelListing(0n);

      await expect(
        escrow.connect(seller).cancelListing(0n),
      ).to.be.revertedWithCustomError(escrow, "ListingNotActive");
    });
  });


  // ---------------------------- Buying ----------------------------

  describe("buy()", function () {
    async function listedFixture() {
      const base = await deployFixture();
      await base.escrow.connect(base.seller).createListing(PRICE, "ipfs://desc");
      return base;
    }

    it("creates a new funded order with the correct amount and deadline", async function () {
      const { escrow, seller, buyer } = await networkHelpers.loadFixture(listedFixture);

      const tx = await escrow.connect(buyer).buy(0n, { value: PRICE });
      const receipt = await tx.wait();
      const block = await ethers.provider.getBlock(receipt.blockNumber);
      const expectedDeadline = BigInt(block.timestamp) + (await escrow.TIMEOUT_DURATION());

      await expect(tx)
        .to.emit(escrow, "OrderCreated")
        .withArgs(0n, 0n, buyer.address, seller.address, PRICE, expectedDeadline);

      const order = await escrow.getOrder(0n);
      expect(order.buyer).to.equal(buyer.address);
      expect(order.seller).to.equal(seller.address);
      expect(order.amount).to.equal(PRICE);
      expect(order.status).to.equal(0n); // Funded

      const listing = await escrow.getListing(0n);
      expect(listing.active).to.equal(false);
    });

    it("denies purchasing a listing with a different amount", async function () {
      const { escrow, buyer } = await networkHelpers.loadFixture(listedFixture);

      await expect(
        escrow.connect(buyer).buy(0n, { value: PRICE - 1n }),
      ).to.be.revertedWithCustomError(escrow, "WrongAmount");
    });

    it("denies purchasing an inactive listing", async function () {
      const { escrow, seller, buyer, other } = await networkHelpers.loadFixture(listedFixture);
      await escrow.connect(buyer).buy(0n, { value: PRICE }); // Buy the listing to make it inactive

      await expect(
        escrow.connect(other).buy(0n, { value: PRICE }),
      ).to.be.revertedWithCustomError(escrow, "ListingNotActive");
    });
  });


  // ---------------------------- Receipt confirmation ----------------------------

  describe("confirmReceipt()", function () {
    async function fundedOrderFixture() {
      const base = await deployFixture();
      await base.escrow.connect(base.seller).createListing(PRICE, "ipfs://desc");
      await base.escrow.connect(base.buyer).buy(0n, { value: PRICE });
      return base;
    }

    it("frees the funds to the seller (pending withdrawal balance)", async function () {
      const { escrow, seller, buyer } = await networkHelpers.loadFixture(fundedOrderFixture);

      await expect(escrow.connect(buyer).confirmReceipt(0n))
        .to.emit(escrow, "OrderConfirmed")
        .withArgs(0n);

      const order = await escrow.getOrder(0n);
      expect(order.status).to.equal(1n); // Released
      expect(await escrow.pendingWithdrawals(seller.address)).to.equal(PRICE);
    });

    it("denies confirmation by anyone other than the buyer", async function () {
      const { escrow, seller } = await networkHelpers.loadFixture(fundedOrderFixture);

      await expect(
        escrow.connect(seller).confirmReceipt(0n),
      ).to.be.revertedWithCustomError(escrow, "NotBuyer");
    });

    it("denies double confirmation", async function () {
      const { escrow, buyer } = await networkHelpers.loadFixture(fundedOrderFixture);
      await escrow.connect(buyer).confirmReceipt(0n);

      await expect(
        escrow.connect(buyer).confirmReceipt(0n),
      ).to.be.revertedWithCustomError(escrow, "WrongStatus");
    });
  });


  // ---------------------------- Timeout ----------------------------

  describe("claimTimeout()", function () {
    async function fundedOrderFixture() {
      const base = await deployFixture();
      await base.escrow.connect(base.seller).createListing(PRICE, "ipfs://desc");
      await base.escrow.connect(base.buyer).buy(0n, { value: PRICE });
      return base;
    }

    it("denies claiming the timeout before the deadline", async function () {
      const { escrow, other } = await networkHelpers.loadFixture(fundedOrderFixture);

      await expect(
        escrow.connect(other).claimTimeout(0n),
      ).to.be.revertedWithCustomError(escrow, "TimeoutNotReached");
    });

    it("frees the funds to the seller after the timeout, callable by anyone", async function () {
      const { escrow, seller, other } = await networkHelpers.loadFixture(fundedOrderFixture);

      const TIMEOUT_DURATION = await escrow.TIMEOUT_DURATION();
      await networkHelpers.time.increase(TIMEOUT_DURATION + 1n);

      await expect(escrow.connect(other).claimTimeout(0n))
        .to.emit(escrow, "OrderTimeoutClaimed")
        .withArgs(0n);

      const order = await escrow.getOrder(0n);
      expect(order.status).to.equal(1n); // Released
      expect(await escrow.pendingWithdrawals(seller.address)).to.equal(PRICE);
    });

    it("denies claiming the timeout if the order is already confirmed", async function () {
      const { escrow, buyer } = await networkHelpers.loadFixture(fundedOrderFixture);
      await escrow.connect(buyer).confirmReceipt(0n);

      const TIMEOUT_DURATION = await escrow.TIMEOUT_DURATION();
      await networkHelpers.time.increase(TIMEOUT_DURATION + 1n);

      await expect(
        escrow.claimTimeout(0n),
      ).to.be.revertedWithCustomError(escrow, "WrongStatus");
    });
  });


  // ---------------------------- Withdrawal (Pull-Payment) ----------------------------

  describe("withdraw()", function () {
    it("transfers the available balance and resets it to zero", async function () {
      const { escrow, seller, buyer } = await networkHelpers.loadFixture(deployFixture);
      await escrow.connect(seller).createListing(PRICE, "ipfs://desc");
      await escrow.connect(buyer).buy(0n, { value: PRICE });
      await escrow.connect(buyer).confirmReceipt(0n);

      const balanceBefore = await ethers.provider.getBalance(seller.address);
      const tx = await escrow.connect(seller).withdraw();
      const receipt = await tx.wait();
      const gasCost = receipt.gasUsed * receipt.gasPrice;
      const balanceAfter = await ethers.provider.getBalance(seller.address);

      expect(balanceAfter).to.equal(balanceBefore + PRICE - gasCost);
      expect(await escrow.pendingWithdrawals(seller.address)).to.equal(0n);
    });

    it("denies withdrawal if there is nothing to withdraw", async function () {
      const { escrow, other } = await networkHelpers.loadFixture(deployFixture);

      await expect(
        escrow.connect(other).withdraw(),
      ).to.be.revertedWithCustomError(escrow, "NothingToWithdraw");
    });
  });


  // ---------------------------- Public Key ----------------------------
  
  describe("registerPublicKey()", function () {
    it("registers the public key and emits the event", async function () {
      const { escrow, seller } = await networkHelpers.loadFixture(deployFixture);
      const fakeKey = "0x1234";

      await expect(escrow.connect(seller).registerPublicKey(fakeKey))
        .to.emit(escrow, "PublicKeyRegistered")
        .withArgs(seller.address, fakeKey);

      expect(await escrow.getPublicKey(seller.address)).to.equal(fakeKey);
    });

    it("denies registering an empty public key", async function () {
      const { escrow, seller } = await networkHelpers.loadFixture(deployFixture);
      await expect(
        escrow.connect(seller).registerPublicKey("0x"),
      ).to.be.revertedWithCustomError(escrow, "EmptyPublicKey");
    });

    it("denies registering a second public key", async function () {
      const { escrow, seller } = await networkHelpers.loadFixture(deployFixture);
      await escrow.connect(seller).registerPublicKey("0x1234");

      await expect(
        escrow.connect(seller).registerPublicKey("0x5678"),
      ).to.be.revertedWithCustomError(escrow, "PublicKeyAlreadyRegistered");
    });
  });


  // ---------------------------- Sending Content ----------------------------

  describe("sendContent()", function () {
    it("increments contentCount and emits the event", async function () {
      const { escrow, seller, buyer } = await networkHelpers.loadFixture(deployFixture);

      await expect(escrow.connect(seller).sendContent(buyer.address, "listing_photo"))
        .to.emit(escrow, "ContentSent")
        .withArgs(0n, seller.address, buyer.address, "listing_photo");

      expect(await escrow.contentCount()).to.equal(1n);
    });

    it("denies sending content to a null recipient", async function () {
      const { escrow, seller } = await networkHelpers.loadFixture(deployFixture);

      await expect(
        escrow.connect(seller).sendContent(ethers.ZeroAddress, "chat_message"),
      ).to.be.revertedWithCustomError(escrow, "InvalidReceiver");
    });
  });
});
