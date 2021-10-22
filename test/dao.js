const { expect } = require("chai");
const { parseEther } = require("ethers/lib/utils");
const { ethers, network } = require("hardhat");

describe("NFT DAO Spec", () => {
  let usr1, usr2, usr3, usr4, users;
  let firstRun = true;

  function parseProposal(proposalArray) {
    return {
      marketplaceId: proposalArray[0].toString(),
      tokenId: proposalArray[1].toString(), // will be the ID on the marketplace
      maxPrice: proposalArray[2].toString(),
      deadline: proposalArray[3].toString(),
      voteCount: proposalArray[4].toString(),
      vote: proposalArray[5].toString(), // +1 for yea, -1 for nea
      executed: proposalArray[6],
      voteTallied: proposalArray[7],
    }
  }

  let fakeDate = new Date()

  async function eightDaysForward() {
    // gabe's time passing test code
    // const date = new Date();
    fakeDate.setDate(fakeDate.getDate() + 8);
    const eightDaysFromNow = fakeDate.getTime();

    await network.provider.send("evm_setNextBlockTimestamp", [
      eightDaysFromNow,
    ]);
    await ethers.provider.send("evm_mine");
  }

  beforeEach(async () => {
    ;[usr1, usr2, usr3, usr4, ...users] = await ethers.getSigners();

    // if (firstRun) {
    //   firstRun = false;
    //   console.log('user', {
    //     usr1: usr1.address,
    //     usr2: usr2.address,
    //     usr3: usr3.address,
    //     usr4: usr4.address,
    //   })
    // }

    const Dao = await ethers.getContractFactory("Dao");
    daoContract = await Dao.deploy();

    const NFTMarketplace = await ethers.getContractFactory("NFTMarketplace");
    marketplace = await NFTMarketplace.deploy();
  });


  describe("Membership", () => {
    it("allows joining for 1 eth", async () => {
      let memberData = await daoContract.memberData(usr1.address);
      expect(memberData).to.be.equal(false);

      await expect(
        daoContract.connect(usr1).joinDAO({value: parseEther(".1")})
      ).to.be.revertedWith("insufficient_funds");

      await daoContract.connect(usr1).joinDAO({value: parseEther("1")})

      await expect(
        daoContract.connect(usr1).joinDAO({value: parseEther("1")})
      ).to.be.revertedWith("already_joined");

      memberData = await daoContract.memberData(usr1.address);
      expect(memberData).to.be.equal(true);
    })

    it("allows only members to make NFT purchase proposals", async () => {
      await expect(
        daoContract.connect(usr1).submitProposal(0,0,parseEther("1"))
      ).to.be.revertedWith("members_only");

      await daoContract.connect(usr1).joinDAO({value: parseEther("1")})
      await daoContract.addMarketplace(marketplace.address);

      await daoContract.connect(usr1).submitProposal(0,232,parseEther("1"))

      let proposal = parseProposal(await daoContract.proposals(0));
      expect(proposal.marketplaceId).to.be.equal("0");
    })
  })


  describe("Voting", () => {
    it("allows only members to vote for proposals", async () => {
      await daoContract.connect(usr1).joinDAO({value: parseEther("1")})
      await daoContract.addMarketplace(marketplace.address);
      await daoContract.connect(usr1).submitProposal(0,232,parseEther("1"))

      let proposal = parseProposal(await daoContract.proposals(0));
      expect(proposal.voteCount).to.be.equal("0");

      await expect(
        daoContract.connect(usr2).vote(0,true)
      ).to.be.revertedWith("members_only");

      await daoContract.connect(usr2).joinDAO({value: parseEther("1")})
      await daoContract.connect(usr2).vote(0,true)

      proposal = parseProposal(await daoContract.proposals(0));

      expect(proposal.voteCount).to.be.equal("1");
    })

    it("allows members to also vote against proposals", async () => {
      await daoContract.connect(usr1).joinDAO({value: parseEther("1")})
      await daoContract.addMarketplace(marketplace.address);
      await daoContract.connect(usr1).submitProposal(0,232,parseEther("1"))
      let proposal = parseProposal(await daoContract.proposals(0));
      expect(proposal.voteCount).to.be.equal("0");

      await daoContract.connect(usr2).joinDAO({value: parseEther("1")})
      await daoContract.connect(usr2).vote(0,false)

      proposal = parseProposal(await daoContract.proposals(0));
      expect(proposal.voteCount).to.be.equal("1");
      expect(proposal.vote).to.be.equal("-1");

      await daoContract.connect(usr3).joinDAO({value: parseEther("1")})
      await daoContract.connect(usr3).vote(0,false)

      proposal = parseProposal(await daoContract.proposals(0));
      expect(proposal.voteCount).to.be.equal("2");
      expect(proposal.vote).to.be.equal("-2");
    })

    it("doesn't allow double voting", async () => {
      await daoContract.connect(usr1).joinDAO({value: parseEther("1")})
      await daoContract.addMarketplace(marketplace.address);
      await daoContract.connect(usr1).submitProposal(0,232,parseEther("1"))
      let proposal = parseProposal(await daoContract.proposals(0));
      expect(proposal.voteCount).to.be.equal("0");

      await daoContract.connect(usr2).joinDAO({value: parseEther("1")})
      await daoContract.connect(usr2).vote(0,true)

      await expect(
        daoContract.connect(usr2).vote(0,true)
      ).to.be.revertedWith("already_voted");

      proposal = parseProposal(await daoContract.proposals(0));

      expect(proposal.voteCount).to.be.equal("1");
    })

    it("allows members to delegate their vote", async () => {
      // user 1 joins and proposes
      await daoContract.connect(usr1).joinDAO({value: parseEther("1")})
      await daoContract.addMarketplace(marketplace.address);
      await daoContract.connect(usr1).submitProposal(0,232,parseEther("1"))

      // users 2,3,4 join
      await daoContract.connect(usr2).joinDAO({value: parseEther("1")})
      await daoContract.connect(usr3).joinDAO({value: parseEther("1")})
      await daoContract.connect(usr4).joinDAO({value: parseEther("1")})

      // no votes yet
      let proposal = parseProposal(await daoContract.proposals(0));
      expect(proposal.voteCount).to.be.equal("0");

      // users 2 & 4 delegate to user 3
      await daoContract.connect(usr2).delegate(0,usr3.address)
      await daoContract.connect(usr4).delegate(0,usr3.address)
      
      // still no votes
      proposal = parseProposal(await daoContract.proposals(0));      
      expect(proposal.voteCount).to.be.equal("0");

      // check delegation is all in place correctly
      expect((await daoContract.getMemberDelegatation(0, usr1.address)).slice(0,4)).to.be.equal('0x000000'.slice(0,4))
      expect(await daoContract.getMemberDelegatation(0, usr2.address)).to.be.equal(usr3.address)
      expect(await daoContract.getMemberDelegatation(0, usr4.address)).to.be.equal(usr3.address)
      expect((await daoContract.getMemberDelegatation(1, usr4.address)).slice(0,4)).to.be.equal('0x000000'.slice(0,4))
      
      // check that usr3 has vote power expected
      expect(await daoContract.getMemberReceivedVotePower(0, usr3.address)).to.be.equal(2)
      expect(await daoContract.connect(usr3).votePower(0)).to.be.equal(3)
      
      // usr3 votes
      await daoContract.connect(usr3).vote(0,true)

      // should register 3 votes
      proposal = parseProposal(await daoContract.proposals(0));
      expect(proposal.voteCount).to.be.equal("3");
      expect(proposal.vote).to.be.equal("3");
    })

    it("handles votes delegated after delagatee has voted", async () => {
      // user 1 joins and proposes
      await daoContract.connect(usr1).joinDAO({value: parseEther("1")})
      await daoContract.addMarketplace(marketplace.address);
      await daoContract.connect(usr1).submitProposal(0,232,parseEther("1"))

      // users 2,3,4 join
      await daoContract.connect(usr2).joinDAO({value: parseEther("1")})
      await daoContract.connect(usr3).joinDAO({value: parseEther("1")})
      await daoContract.connect(usr4).joinDAO({value: parseEther("1")})

      // no votes yet
      let proposal = parseProposal(await daoContract.proposals(0));
      expect(proposal.voteCount).to.be.equal("0");

      // users 2 & 4 delegate to user 3
      await daoContract.connect(usr2).delegate(0,usr3.address)
      
      // still no votes
      proposal = parseProposal(await daoContract.proposals(0));      
      expect(proposal.voteCount).to.be.equal("0");

      // check delegation is all in place correctly
      expect((await daoContract.getMemberDelegatation(0, usr1.address)).slice(0,4)).to.be.equal('0x000000'.slice(0,4))
      expect(await daoContract.getMemberDelegatation(0, usr2.address)).to.be.equal(usr3.address)
      
      // check that usr3 has vote power expected
      expect(await daoContract.getMemberReceivedVotePower(0, usr3.address)).to.be.equal(1)
      expect(await daoContract.connect(usr3).votePower(0)).to.be.equal(2)
      
      // usr3 votes
      await daoContract.connect(usr3).vote(0,true)
      
      // should register 2 votes
      proposal = parseProposal(await daoContract.proposals(0));
      expect(proposal.voteCount).to.be.equal("2");
      expect(proposal.vote).to.be.equal("2");

      // usr4 delegates to usr3 after they have already voted, 
      // but this just means they auto-vote for whatever 3 voted for
      await daoContract.connect(usr4).delegate(0,usr3.address)

      // should register 3 votes
      proposal = parseProposal(await daoContract.proposals(0));
      expect(proposal.voteCount).to.be.equal("3");
      expect(proposal.vote).to.be.equal("3");
    })


    it("handles a mix of yea nad nea votes, including some delegated after delagatee has voted", async () => {
      // user 1 joins and proposes
      await daoContract.connect(usr1).joinDAO({value: parseEther("1")})
      await daoContract.addMarketplace(marketplace.address);
      await daoContract.connect(usr1).submitProposal(0,232,parseEther("1"))

      // users 2,3,4 join
      await daoContract.connect(usr2).joinDAO({value: parseEther("1")})
      await daoContract.connect(usr3).joinDAO({value: parseEther("1")})
      await daoContract.connect(usr4).joinDAO({value: parseEther("1")})

      // these users will vote against
      await daoContract.connect(users[0]).joinDAO({value: parseEther("1")})
      await daoContract.connect(users[1]).joinDAO({value: parseEther("1")})

      // no votes yet
      let proposal = parseProposal(await daoContract.proposals(0));
      expect(proposal.voteCount).to.be.equal("0");

      // users 2 & 4 delegate to user 3
      await daoContract.connect(usr2).delegate(0,usr3.address)
      
      // still no votes
      proposal = parseProposal(await daoContract.proposals(0));      
      expect(proposal.voteCount).to.be.equal("0");

      // check delegation is all in place correctly
      expect((await daoContract.getMemberDelegatation(0, usr1.address)).slice(0,4)).to.be.equal('0x000000'.slice(0,4))
      expect(await daoContract.getMemberDelegatation(0, usr2.address)).to.be.equal(usr3.address)
      
      // check that usr3 has vote power expected
      expect(await daoContract.getMemberReceivedVotePower(0, usr3.address)).to.be.equal(1)
      expect(await daoContract.connect(usr3).votePower(0)).to.be.equal(2)
      
      // usr3 votes
      await daoContract.connect(usr3).vote(0,true)
      
      // should register 2 votes
      proposal = parseProposal(await daoContract.proposals(0));
      expect(proposal.voteCount).to.be.equal("2");
      expect(proposal.vote).to.be.equal("2");

      // usr4 delegates to usr3 after they have already voted, 
      // but this just means they auto-vote for whatever 3 voted for
      await daoContract.connect(usr4).delegate(0,usr3.address)

      // should register 3 votes
      proposal = parseProposal(await daoContract.proposals(0));
      expect(proposal.voteCount).to.be.equal("3");
      expect(proposal.vote).to.be.equal("3");

      // now 2 votes vote against
      await daoContract.connect(users[0]).vote(0,false)
      await daoContract.connect(users[1]).vote(0,false)
      
      // should register 5 votes, with net vote of 1
      proposal = parseProposal(await daoContract.proposals(0));
      expect(proposal.voteCount).to.be.equal("5");
      expect(proposal.vote).to.be.equal("1");

      // now 2 more join and vote against
      await daoContract.connect(users[2]).joinDAO({value: parseEther("1")})
      await daoContract.connect(users[3]).joinDAO({value: parseEther("1")})
      await daoContract.connect(users[2]).vote(0,false)
      await daoContract.connect(users[3]).vote(0,false)
      
      // should register 5 votes, with net vote of 1
      proposal = parseProposal(await daoContract.proposals(0));
      expect(proposal.voteCount).to.be.equal("7");
      expect(proposal.vote).to.be.equal("-1");
    })
  })


  describe("Purchase Execution", () => {
    it("allows execution when quorum is reached and majority votes yea after deadline and price is within bounds", async () => {
      await daoContract.connect(usr1).joinDAO({value: parseEther("1")})
      await daoContract.connect(usr2).joinDAO({value: parseEther("1")})
      await daoContract.connect(usr3).joinDAO({value: parseEther("1")})
      await daoContract.connect(usr4).joinDAO({value: parseEther("1")})

      await daoContract.connect(usr3).addMarketplace(marketplace.address)
      await daoContract.connect(usr1).submitProposal(0,232,parseEther("2.1"))
      let proposal = parseProposal(await daoContract.proposals(0));
      expect(proposal.voteCount).to.be.equal("0");

      await daoContract.connect(usr2).vote(0,true)

      proposal = parseProposal(await daoContract.proposals(0));
      expect(proposal.voteCount).to.be.equal("1");
      expect(proposal.vote).to.be.equal("1");

      await daoContract.connect(usr3).vote(0,true)

      proposal = parseProposal(await daoContract.proposals(0));
      expect(proposal.voteCount).to.be.equal("2");
      expect(proposal.vote).to.be.equal("2");


      eightDaysForward();

      let ownerBefore = await marketplace.tokens(232);
      await daoContract.connect(usr1).executeProposal(0);
      let ownerAfter = await marketplace.tokens(232);
      expect(ownerBefore).to.not.be.equal(daoContract.address);
      expect(ownerAfter).to.be.equal(daoContract.address);
    })

    it("rejects execution if before deadline", async () => {
      await daoContract.connect(usr1).joinDAO({value: parseEther("1")})
      await daoContract.connect(usr2).joinDAO({value: parseEther("1")})
      await daoContract.connect(usr3).joinDAO({value: parseEther("1")})
      await daoContract.connect(usr4).joinDAO({value: parseEther("1")})
      
      await daoContract.connect(usr3).addMarketplace(marketplace.address)
      await daoContract.connect(usr1).submitProposal(0,232,parseEther("2.1"))
      let proposal = parseProposal(await daoContract.proposals(0));
      expect(proposal.voteCount).to.be.equal("0");

      await daoContract.connect(usr2).vote(0,true)

      proposal = parseProposal(await daoContract.proposals(0));
      expect(proposal.voteCount).to.be.equal("1");
      expect(proposal.vote).to.be.equal("1");

      await daoContract.connect(usr3).vote(0,true)

      proposal = parseProposal(await daoContract.proposals(0));
      expect(proposal.voteCount).to.be.equal("2");
      expect(proposal.vote).to.be.equal("2");

      await expect(
        daoContract.connect(usr1).executeProposal(0)
      ).to.be.revertedWith("deadline_not_passed");
    })

    it("rejects execution if quorum is not reached", async () => {
      await daoContract.connect(usr1).joinDAO({value: parseEther("1")})
      await daoContract.connect(usr2).joinDAO({value: parseEther("1")})
      await daoContract.connect(usr3).joinDAO({value: parseEther("1")})
      await daoContract.connect(usr4).joinDAO({value: parseEther("1")})
      await daoContract.connect(users[0]).joinDAO({value: parseEther("1")})
      await daoContract.connect(users[1]).joinDAO({value: parseEther("1")})
      await daoContract.connect(users[2]).joinDAO({value: parseEther("1")})
      await daoContract.connect(users[3]).joinDAO({value: parseEther("1")})
      await daoContract.connect(users[4]).joinDAO({value: parseEther("1")})
      // 9 users

      await daoContract.connect(usr3).addMarketplace(marketplace.address)
      await daoContract.connect(usr1).submitProposal(0,232,parseEther("2.1"))
      let proposal = parseProposal(await daoContract.proposals(0));
      expect(proposal.voteCount).to.be.equal("0");

      await daoContract.connect(usr2).vote(0,true)

      proposal = parseProposal(await daoContract.proposals(0));
      expect(proposal.voteCount).to.be.equal("1");
      expect(proposal.vote).to.be.equal("1");

      await daoContract.connect(usr3).vote(0,true)

      proposal = parseProposal(await daoContract.proposals(0));
      expect(proposal.voteCount).to.be.equal("2");
      expect(proposal.vote).to.be.equal("2");
      // 2 voted, 2 is less than 25% of 9

      eightDaysForward();

      let ownerBefore = await marketplace.tokens(232);
      await expect(
        daoContract.connect(usr1).executeProposal(0)
      ).to.be.revertedWith("quorum_required");
      console.log("attempted execution")  
      // todo: write test to expect failure from no quorum reached

      let ownerAfter = await marketplace.tokens(232);
      expect(ownerBefore).to.not.be.equal(daoContract.address);
      expect(ownerAfter).to.not.be.equal(daoContract.address);
    })

    it("rejects execution if majority does not votes yea", async () => {
      await daoContract.connect(usr1).joinDAO({value: parseEther("1")})
      await daoContract.connect(usr2).joinDAO({value: parseEther("1")})
      await daoContract.connect(usr3).joinDAO({value: parseEther("1")})
      await daoContract.connect(usr4).joinDAO({value: parseEther("1")})

      await daoContract.connect(usr3).addMarketplace(marketplace.address)
      await daoContract.connect(usr1).submitProposal(0,232,parseEther("2.1"))
      let proposal = parseProposal(await daoContract.proposals(0));
      expect(proposal.voteCount).to.be.equal("0");

      await daoContract.connect(usr2).vote(0,true)

      proposal = parseProposal(await daoContract.proposals(0));
      expect(proposal.voteCount).to.be.equal("1");
      expect(proposal.vote).to.be.equal("1");

      await daoContract.connect(usr3).vote(0,false)

      proposal = parseProposal(await daoContract.proposals(0));
      expect(proposal.voteCount).to.be.equal("2");
      expect(proposal.vote).to.be.equal("0");


      eightDaysForward();

      let ownerBefore = await marketplace.tokens(232);
      await expect(
        daoContract.connect(usr1).executeProposal(0)
      ).to.be.revertedWith("proposal_rejected");
      console.log("attempted execution")  
      // todo: write test to expect this to fail because not a majority yes vote

      let ownerAfter = await marketplace.tokens(232);
      expect(ownerBefore).to.not.be.equal(daoContract.address);
      expect(ownerAfter).to.not.be.equal(daoContract.address);
    })

    it("rejects execution if price is too high", async () => {
      await daoContract.connect(usr1).joinDAO({value: parseEther("1")})
      await daoContract.connect(usr2).joinDAO({value: parseEther("1")})
      await daoContract.connect(usr3).joinDAO({value: parseEther("1")})
      await daoContract.connect(usr4).joinDAO({value: parseEther("1")})

      await daoContract.connect(usr3).addMarketplace(marketplace.address)
      await daoContract.connect(usr1).submitProposal(0,232,parseEther("1.9"))
      let proposal = parseProposal(await daoContract.proposals(0));
      expect(proposal.voteCount).to.be.equal("0");

      await daoContract.connect(usr2).vote(0,true)

      proposal = parseProposal(await daoContract.proposals(0));
      expect(proposal.voteCount).to.be.equal("1");
      expect(proposal.vote).to.be.equal("1");

      await daoContract.connect(usr3).vote(0,true)

      proposal = parseProposal(await daoContract.proposals(0));
      expect(proposal.voteCount).to.be.equal("2");
      expect(proposal.vote).to.be.equal("2");


      eightDaysForward();

      let ownerBefore = await marketplace.tokens(232);

      await expect(
        daoContract.connect(usr1).executeProposal(0)
      ).to.be.revertedWith("price_too_high");

      let ownerAfter = await marketplace.tokens(232);
      expect(ownerBefore).to.not.be.equal(daoContract.address);
      expect(ownerAfter).to.not.be.equal(daoContract.address);
    })
  })

});
