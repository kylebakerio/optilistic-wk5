// As specified by Gilbert's advised psuedo-interface
// https://discord.com/channels/870313767873962014/873779520778420224/900209632998477845

//SPDX-License-Identifier: Unlicense
pragma solidity ^0.8.0;

import "hardhat/console.sol";

contract NFTMarketplace {
  mapping (uint => address) public tokens; // not realistic, just for testing purchase call
  uint price = 2 ether;

  function getPrice(uint _tokenId) external view returns (uint) {
    return price;
  }
  function purchase(uint _tokenId) external payable {
    require(msg.value >= price, "insufficient_ether");
    tokens[_tokenId] = msg.sender;
  }
}
