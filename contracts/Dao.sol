//SPDX-License-Identifier: Unlicense
pragma solidity ^0.8.0;

import "hardhat/console.sol";

// Gilbert's advised psuedo-interface
// https://discord.com/channels/870313767873962014/873779520778420224/900209632998477845
interface INFTMarketplace {
  function getPrice(uint tokenId) external view returns (uint);
  function purchase(uint tokenId) external payable;
}

contract Dao {
    enum CheckDeadline {
        Before,
        After
    }

    uint public proposalCount;
    enum VoteStatus {
        NotVoted,
        Yea,
        Nea
    }
    struct Proposal {
        // address seller; // part of a more generalized idea I was going with
        uint marketplaceId;
        uint tokenId; // will be the ID on the marketplace
        uint maxPrice;
        uint deadline;
        uint voteCount;
        int vote; // +1 for yea, -1 for nea

        bool executed;
        bool voteTallied;
    }
    mapping(uint => Proposal) public proposals; // proposalId => tokenId 
    
    uint memberCount;
    struct Member {
        bool isMember;
        mapping(uint => VoteStatus) votes; // proposalId => vote | record their votes
        mapping(uint => address) delegateTo; // proposalId => member this proposal vote is delegated to
        mapping(uint => uint) delegatedVotePower; // proposalId => how many people delegated to this member for this proposal
    }
    mapping(address => Member) public memberData;

    uint public marketplaceCount;
    mapping(uint => address) public marketPlaces;

    event Quorum(uint proposalId, Proposal proposal);
    event VoteTallied(uint proposalId, Proposal proposal, bool result);
    event Purchase(uint proposalId, Proposal proposal);

    modifier membersOnly() {
        require(memberData[msg.sender].isMember, "members_only");
        _;
    }

    modifier deadline(CheckDeadline _beforeOrAfter, uint _proposalId) {
        require(_beforeOrAfter == CheckDeadline.Before ?
            proposals[_proposalId].deadline > block.timestamp : 
            proposals[_proposalId].deadline < block.timestamp
            , _beforeOrAfter == CheckDeadline.Before ? "deadline_passed" : "deadline_not_passed");
        _;
    }

    modifier quorumReached(uint _proposalId) {
        require(checkQuorum(_proposalId), "quorum_required");
        _;
    }

    // getters for accessing mapping values in struct
    function getMemberVote(uint _proposalId, address _member) public view membersOnly returns (VoteStatus) {
        return memberData[_member].votes[_proposalId];
    }
    function getMemberDelegatation(uint _proposalId, address _member) public view membersOnly returns (address) {
        return memberData[_member].delegateTo[_proposalId];
    }
    function getMemberReceivedVotePower(uint _proposalId, address _member) public view membersOnly returns (uint) {
        // this excludes a member's own vote, which is included in votePower
        return memberData[_member].delegatedVotePower[_proposalId];
    }



    function checkQuorum(uint _proposalId) internal view returns(bool) {
        return proposals[_proposalId].voteCount * 4 >= memberCount;
    }

    function joinDAO() public payable {
        require(msg.value >= 1 ether, "insufficient_funds");
        require(!memberData[msg.sender].isMember, "already_joined");
        memberData[msg.sender].isMember = true;
        memberCount++;
    }


    // verify marketplace works before allowing proposal creation to vote on
    function testMarketplace(uint _marketplaceId, uint _tokenId) public membersOnly returns (bool){
        INFTMarketplace(marketPlaces[_marketplaceId]).getPrice(_tokenId);
        return true;
    }

    function addMarketplace(address _marketplace) public membersOnly {
        marketPlaces[marketplaceCount] = _marketplace;
        marketplaceCount++;
    }

    function submitProposal(uint _marketplaceId, uint _tokenId, uint _maxPrice) public membersOnly returns (uint) {
        require(testMarketplace(_marketplaceId, _tokenId), "invalid_proposal");

        proposals[proposalCount] = Proposal(_marketplaceId, _tokenId, _maxPrice, block.timestamp + 7 days, 0, 0, false, false);
        proposalCount++;
        return proposalCount-1;
    }

    // once a user opts into delegate their voting power, it's continuous until they opt out
    // ^this was added later, but not specified in original spec
    // original implementation: delegate per-proposal
    function delegate(uint _proposalId, address _delegatee) public membersOnly {
        require(memberData[msg.sender].delegateTo[_proposalId] == address(0), "cannot_change_delegation");
        // re-delegating would create potential vulnerabilities
        require(memberData[_delegatee].delegateTo[_proposalId] == address(0), "cannot_receive_delegation");

        if (memberData[_delegatee].votes[_proposalId] != VoteStatus.NotVoted) {
            // the person they delegate to has already voted, so just mimic that user's vote
            bool delegateeVote = memberData[_delegatee].votes[_proposalId] == VoteStatus.Yea;
            vote(_proposalId, delegateeVote);
        } else {
            memberData[_delegatee].delegatedVotePower[_proposalId]+= uint(votePower(_proposalId));
            // increase vote power of user who receives delegation
        }

        memberData[msg.sender].delegateTo[_proposalId] = _delegatee;
        // store delegation record to prevent abuse
    }

    function superDelegate(address _delegatee) public membersOnly {
        // check user proposal black list
    }

    function unSuperDelegate(address _delegatee) public membersOnly {
        // check if delegatee has voted
        // check if delagatee has also delegated
        // if yes to either, add this proposal to user proposal black list 
    }

    function votePower(uint _proposalId) public view returns (int) {
        return int(memberData[msg.sender].delegatedVotePower[_proposalId]) + 1; // +1 because of user's own vote
    }

    function vote(uint _proposalId, bool votesYea) public membersOnly deadline(CheckDeadline.Before, _proposalId) {
        require(memberData[msg.sender].votes[_proposalId] == VoteStatus.NotVoted, "already_voted");
        require(memberData[msg.sender].delegateTo[_proposalId] == address(0), "vote_delegated");
        
        proposals[_proposalId].vote += votesYea ? votePower(_proposalId) : -votePower(_proposalId);
        proposals[_proposalId].voteCount+= uint(votePower(_proposalId)); // for tracking quorum

        // console.log('vote, votePower', msg.sender, uint(proposals[_proposalId].vote), uint(votePower(_proposalId)));

        memberData[msg.sender].votes[_proposalId] = votesYea ? VoteStatus.Yea : VoteStatus.Nea;

        if (checkQuorum(_proposalId)) {
            emit Quorum(_proposalId, proposals[_proposalId]);
        }
    }

    function executeProposal(uint _proposalId) public membersOnly deadline(CheckDeadline.After, _proposalId) quorumReached(_proposalId) {
        require(!proposals[_proposalId].executed, "already_executed");
        require(!proposals[_proposalId].voteTallied, "already_voted");

        if (proposals[_proposalId].vote < 1) {
            proposals[_proposalId].voteTallied = true;
            emit VoteTallied(_proposalId, proposals[_proposalId], false);
            revert("proposal_rejected");
        }

        uint marketplaceId = proposals[_proposalId].marketplaceId;
        uint tokenId = proposals[_proposalId].tokenId;

        uint maxPrice = proposals[_proposalId].maxPrice;
        uint price = INFTMarketplace(marketPlaces[marketplaceId]).getPrice(tokenId);
        require(price < maxPrice, "price_too_high");
        
        INFTMarketplace(marketPlaces[marketplaceId]).purchase{value: price}(tokenId);
        emit VoteTallied(_proposalId, proposals[_proposalId], true);
        proposals[_proposalId].executed = true;

        emit Purchase(_proposalId, proposals[_proposalId]);
    }
}
