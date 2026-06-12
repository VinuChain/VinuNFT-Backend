// SPDX-License-Identifier: MIT
pragma solidity ^0.8.6;

/// [MIT License]
library StringUtils {
    bytes16 private constant _HEX_SYMBOLS = "0123456789abcdef";

    function escapeJSONString(string memory value) internal pure returns (string memory) {
        bytes memory input = bytes(value);
        uint256 escapedLength = input.length;

        for (uint256 i = 0; i < input.length; i++) {
            uint8 charCode = uint8(input[i]);
            if (input[i] == 0x22 || input[i] == 0x5c) {
                escapedLength += 1;
            } else if (charCode < 0x20) {
                escapedLength += 5;
            }
        }

        bytes memory output = new bytes(escapedLength);
        uint256 cursor = 0;

        for (uint256 i = 0; i < input.length; i++) {
            uint8 charCode = uint8(input[i]);

            if (input[i] == 0x22 || input[i] == 0x5c) {
                output[cursor++] = 0x5c;
                output[cursor++] = input[i];
            } else if (charCode < 0x20) {
                output[cursor++] = 0x5c;
                output[cursor++] = 0x75;
                output[cursor++] = 0x30;
                output[cursor++] = 0x30;
                output[cursor++] = _HEX_SYMBOLS[charCode >> 4];
                output[cursor++] = _HEX_SYMBOLS[charCode & 0x0f];
            } else {
                output[cursor++] = input[i];
            }
        }

        return string(output);
    }
}
