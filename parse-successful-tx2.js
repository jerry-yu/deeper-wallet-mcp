// Parse successful transaction calldata more accurately
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
  console.log('\n=== Inputs Array ===');
  const inputsArrayOffset = parseInt(data.substring(320, 384), 16);
  console.log('Inputs array offset:', inputsArrayOffset, '(0x' + data.substring(320, 384) + ')');
  
  const inputsArrayLength = parseInt(data.substring(384, 448), 16);
  console.log('Inputs array length:', inputsArrayLength, '(0x' + data.substring(384, 448) + ')');
  
  // First input offset (V2_SWAP_EXACT_IN)
  const firstInputOffset = parseInt(data.substring(448, 512), 16);
  console.log('\nFirst input offset (V2):', firstInputOffset, '(0x' + data.substring(448, 512) + ')');
  
  // Second input offset (V3_SWAP_EXACT_IN)
  const secondInputOffset = parseInt(data.substring(512, 576), 16);
  console.log('Second input offset (V3):', secondInputOffset, '(0x' + data.substring(512, 576) + ')');
  
  // Third input offset (UNWRAP_WETH)
  const thirdInputOffset = parseInt(data.substring(576, 640), 16);
  console.log('Third input offset (UNWRAP):', thirdInputOffset, '(0x' + data.substring(576, 640) + ')');
  
  // Fourth input offset (SWEEP)
  const fourthInputOffset = parseInt(data.substring(640, 704), 16);
  console.log('Fourth input offset (SWEEP):', fourthInputOffset, '(0x' + data.substring(640, 704) + ')');
  
  // Parse each input
  console.log('\n=== First Input (V2_SWAP_EXACT_IN) ===');
  const firstInputStart = firstInputOffset * 2; // Convert bytes to hex chars
  const firstInputLength = parseInt(data.substring(firstInputStart, firstInputStart + 64), 16);
  console.log('First input length:', firstInputLength);
  
  // Parse V2 swap parameters
  const v2AmountIn = parseInt(data.substring(firstInputStart + 64, firstInputStart + 128), 16);
  console.log('V2 Amount in:', v2AmountIn);
  
  const v2AmountOutMin = parseInt(data.substring(firstInputStart + 128, firstInputStart + 192), 16);
  console.log('V2 Amount out min:', v2AmountOutMin);
  
  console.log('\n=== Second Input (V3_SWAP_EXACT_IN) ===');
  const secondInputStart = secondInputOffset * 2;
  const secondInputLength = parseInt(data.substring(secondInputStart, secondInputStart + 64), 16);
  console.log('Second input length:', secondInputLength);
  
  // Parse V3 swap parameters
  const v3AmountIn = parseInt(data.substring(secondInputStart + 64, secondInputStart + 128), 16);
  console.log('V3 Amount in:', v3AmountIn);
  
  const v3AmountOutMin = parseInt(data.substring(secondInputStart + 128, secondInputStart + 192), 16);
  console.log('V3 Amount out min:', v3AmountOutMin);
  
  console.log('\n=== Third Input (UNWRAP_WETH) ===');
  const thirdInputStart = thirdInputOffset * 2;
  const thirdInputLength = parseInt(data.substring(thirdInputStart, thirdInputStart + 64), 16);
  console.log('Third input length:', thirdInputLength);
  
  const unwrapAmountMin = parseInt(data.substring(thirdInputStart + 64, thirdInputStart + 128), 16);
  console.log('Unwrap amount min:', unwrapAmountMin);
  
  console.log('\n=== Fourth Input (SWEEP) ===');
  const fourthInputStart = fourthInputOffset * 2;
  const fourthInputLength = parseInt(data.substring(fourthInputStart, fourthInputStart + 64), 16);
  console.log('Fourth input length:', fourthInputLength);
  
  // Parse sweep parameters
  const sweepToken = '0x' + data.substring(fourthInputStart + 64, fourthInputStart + 106);
  console.log('Sweep token:', sweepToken);
  
  const sweepRecipient = '0x' + data.substring(fourthInputStart + 106, fourthInputStart + 148);
  console.log('Sweep recipient:', sweepRecipient);
  
  console.log('\n=== Transaction Summary ===');
  console.log('Function: execute(bytes,bytes[],uint256)');
  console.log('Value: 0.001 ETH (1000000000000000 wei)');
  console.log('Commands: V2_SWAP_EXACT_IN, V3_SWAP_EXACT_IN, UNWRAP_WETH, SWEEP');
  console.log('Input token: ETH');
  console.log('Output token: USDC (0x1c7D4B196Cb0C7B01d743Fbc6116a902379C7238)');
  console.log('Recipient: 0x90df5a3ede13ee1d090573460e13b0bfd8aa9708');
}

parseSuccessfulCalldata();