// Parse successful transaction calldata
const { ethers } = require('ethers');

function parseSuccessfulCalldata() {
  const calldata = "0x3593564c000000000000000000000000000000000000000000000000000000000000006000000000000000000000000000000000000000000000000000000000000000a00000000000000000000000000000000000000000000000000000000068b91f4f00000000000000000000000000000000000000000000000000000000000000040b0006040000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000040000000000000000000000000000000000000000000000000000000000000008000000000000000000000000000000000000000000000000000000000000000e0000000000000000000000000000000000000000000000000000000000000020000000000000000000000000000000000000000000000000000000000000002800000000000000000000000000000000000000000000000000000000000000040000000000000000000000000000000000000000000000000000000000000000200000000000000000000000000000000000000000000000000038d7ea4c680000000000000000000000000000000000000000000000000000000000000000100000000000000000000000000000000000000000000000000000000000000000200000000000000000000000000000000000000000000000000038d7ea4c68000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000a00000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000000002bfff9976782d46cc05630d1f6ebab18b2324d6b140000641c7d4b196cb0c7b01d743fbc6116a902379c7238000000000000000000000000000000000000000000";

  console.log('=== Parsing Successful Transaction Calldata ===\n');
  
  // Function selector (first 4 bytes)
  const functionSelector = calldata.substring(0, 10);
  console.log('Function Selector:', functionSelector);
  
  // Parse the parameters
  const data = calldata.substring(10);
  
  // First parameter: offset to commands (0x60 = 96 bytes)
  const commandsOffset = parseInt(data.substring(0, 64), 16);
  console.log('Commands offset:', commandsOffset, '(0x' + data.substring(0, 64) + ')');
  
  // Second parameter: offset to inputs array (0xa0 = 160 bytes)
  const inputsOffset = parseInt(data.substring(64, 128), 16);
  console.log('Inputs offset:', inputsOffset, '(0x' + data.substring(64, 128) + ')');
  
  // Third parameter: deadline
  const deadline = parseInt(data.substring(128, 192), 16);
  const deadlineDate = new Date(deadline * 1000);
  console.log('Deadline:', deadline, '(0x' + data.substring(128, 192) + ')');
  console.log('Deadline date:', deadlineDate.toISOString());
  
  // Commands data
  const commandsLength = parseInt(data.substring(192, 256), 16);
  console.log('Commands length:', commandsLength, '(0x' + data.substring(192, 256) + ')');
  
  const commands = data.substring(256, 256 + commandsLength * 2);
  console.log('Commands:', commands);
  
  // Parse individual commands
  for (let i = 0; i < commands.length; i += 2) {
    const command = commands.substring(i, i + 2);
    const commandNum = parseInt(command, 16);
    console.log(`Command ${i/2}: 0x${command} (${commandNum})`);
  }
  
  console.log('\nCommand meanings:');
  console.log('0x0b (11) - V2_SWAP_EXACT_IN');
  console.log('0x00 (0)  - V3_SWAP_EXACT_IN');
  console.log('0x06 (6)  - UNWRAP_WETH');
  console.log('0x04 (4)  - SWEEP');
  
  // Parse inputs array
  const inputsArrayOffset = parseInt(data.substring(320, 384), 16);
  console.log('\nInputs array offset:', inputsArrayOffset, '(0x' + data.substring(320, 384) + ')');
  
  const inputsArrayLength = parseInt(data.substring(384, 448), 16);
  console.log('Inputs array length:', inputsArrayLength, '(0x' + data.substring(384, 448) + ')');
  
  // First input
  const firstInputOffset = parseInt(data.substring(448, 512), 16);
  console.log('\nFirst input offset:', firstInputOffset, '(0x' + data.substring(448, 512) + ')');
  
  // Second input
  const secondInputOffset = parseInt(data.substring(512, 576), 16);
  console.log('Second input offset:', secondInputOffset, '(0x' + data.substring(512, 576) + ')');
  
  // Third input
  const thirdInputOffset = parseInt(data.substring(576, 640), 16);
  console.log('Third input offset:', thirdInputOffset, '(0x' + data.substring(576, 640) + ')');
  
  // First input details
  console.log('\n=== First Input Details (V2 Swap) ===');
  const firstInputLength = parseInt(data.substring(640, 704), 16);
  console.log('First input length:', firstInputLength, '(0x' + data.substring(640, 704) + ')');
  
  const firstInputData = data.substring(704, 704 + firstInputLength * 2);
  console.log('First input data:', firstInputData);
  
  // Second input details
  console.log('\n=== Second Input Details (V3 Swap) ===');
  const secondInputLength = parseInt(data.substring(1088, 1152), 16);
  console.log('Second input length:', secondInputLength, '(0x' + data.substring(1088, 1152) + ')');
  
  const secondInputData = data.substring(1152, 1152 + secondInputLength * 2);
  console.log('Second input data:', secondInputData);
  
  // Third input details
  console.log('\n=== Third Input Details (Sweep) ===');
  const thirdInputLength = parseInt(data.substring(1856, 1920), 16);
  console.log('Third input length:', thirdInputLength, '(0x' + data.substring(1856, 1920) + ')');
  
  const thirdInputData = data.substring(1920, 1920 + thirdInputLength * 2);
  console.log('Third input data:', thirdInputData);
  
  // Parse the swap parameters
  console.log('\n=== Parsing Swap Parameters ===');
  
  // Parse V2 swap path
  console.log('\nV2 Swap Path:');
  const v2PathLength = parseInt(secondInputData.substring(0, 64), 16);
  console.log('V2 Path length:', v2PathLength);
  
  const v2Token1 = '0x' + secondInputData.substring(64, 106);
  const v2Token2 = '0x' + secondInputData.substring(106, 148);
  console.log('V2 Token 1 (WETH):', v2Token1);
  console.log('V2 Token 2 (USDC):', v2Token2);
  
  // Parse V3 swap parameters
  console.log('\nV3 Swap Parameters:');
  const amountInV3 = parseInt(secondInputData.substring(160, 224), 16);
  console.log('Amount in (V3):', amountInV3, '(0x' + secondInputData.substring(160, 224) + ')');
  
  const amountOutV3 = parseInt(secondInputData.substring(224, 288), 16);
  console.log('Amount out (V3):', amountOutV3, '(0x' + secondInputData.substring(224, 288) + ')');
  
  // Parse sweep parameters
  console.log('\nSweep Parameters:');
  const sweepToken = '0x' + thirdInputData.substring(128, 170);
  console.log('Sweep token (USDC):', sweepToken);
  
  const sweepRecipient = '0x' + thirdInputData.substring(170, 212);
  console.log('Sweep recipient:', sweepRecipient);
}

parseSuccessfulCalldata();