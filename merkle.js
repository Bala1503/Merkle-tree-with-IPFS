const crypto = require('crypto');
const { create } = require('ipfs-http-client');
const fs = require('fs');
const { exec } = require('child_process');

class Node {
    constructor(cid, parent = null) {
        this.parent = parent;
        this.cid = cid;
        this.left = null;
        this.right = null;
    }
}

class MerkleTree {
    constructor() {
        this.map = new Map();
        // Connect to local IPFS node
        this.ipfs = create({ host: '127.0.0.1', port: '5001', protocol: 'http' });
    }

    // Function to hash file data using IPFS
    async hashFile(data) {
        const result = await this.ipfs.add(data);
        return result.cid.toString();
    }

    // Function to build a Merkle tree from a list of files
    async merkletree(files) {
        let queue = [];

        for (const file of files) {
            // Check if the file is a string (for raw data) or a file path
            const fileExtensionRegex = /\.[0-9a-z]+$/i;
            let fileData = '';
            if (!fileExtensionRegex.test(file)) {
                fileData = file.toString();
            } else {
                fileData = fs.readFileSync(file);
            }
            // Hash the file data and create a new node
            const cid = await this.hashFile(fileData);
            const newNode = new Node(cid);
            queue.push(newNode);
            // Add mapping for later verification
            this.map.set(cid, newNode);
        }

        // Build the Merkle tree iteratively
        while (queue.length !== 1) {
            if (queue.length % 2 === 1) {
                // Duplicate the last node if the number of nodes is odd
                queue.push(new Node(queue[queue.length - 1].cid));
            }

            let newQueue = [];

            for (let i = 0; i < queue.length; i += 2) {
                // Combine hash values of two nodes to create a new parent node
                const combined = crypto
                    .createHash('sha256')
                    .update(queue[i].cid + queue[i + 1].cid)
                    .digest('hex');

                const newNode = new Node(combined);
                newNode.left = queue[i];
                newNode.left.parent = newNode;
                newNode.right = queue[i + 1];
                newNode.right.parent = newNode;
                newQueue.push(newNode);
            }

            queue = newQueue;
        }

        return queue[0]; // Return the root of the Merkle tree
    }

    // Function to print the Merkle tree for visualization
    printTree(root, depth = 0) {
        if (root == null) {
            return;
        }
        const padding = '    '.repeat(depth);
        console.log(padding + root.cid);
        this.printTree(root.left, depth + 1);
        this.printTree(root.right, depth + 1);
    }

    // Function to retrieve a node by its CID
    getnode(cid) {
        if (this.map.has(cid)) {
            return this.map.get(cid);
        } else {
            return null;
        }
    }

    // Function to verify the integrity of a transaction by recalculating the Merkle root
    async verify(node) {
        let firstHash = node.cid;
        let secondHash;
        let combined;

        while (node.parent !== null) {
            if (node.parent.left.cid === node.cid) {
                secondHash = node.parent.right.cid;
                combined = crypto
                    .createHash('sha256')
                    .update(firstHash + secondHash)
                    .digest('hex');
            } else if (node.parent.right.cid === node.cid) {
                secondHash = node.parent.left.cid;
                combined = crypto
                    .createHash('sha256')
                    .update(secondHash + firstHash)
                    .digest('hex');
            }

            console.log('First Hash: ', firstHash);
            console.log('Second Hash: ', secondHash);
            console.log('Combined Hash: ', combined);

            firstHash = combined;
            node = node.parent;
        }

        return combined;
    }

    // Function to retrieve a file using its CID from IPFS
    retrieve(cid) {
        const command = `.\\ipfs.exe get ${cid}`;

        exec(command, (error, stdout, stderr) => {
            if (error) {
                console.error(`Error executing command: ${error.message}`);
                return;
            }

            if (stderr) {
                console.error(`Command stderr: ${stderr}`);
                return;
            }

            console.log(`Command output: ${stdout}`);
        });
    }
}

// Main execution block
(async () => {
    const merkleTree = new MerkleTree();
    // List of files (or data) to be included in the Merkle tree
    const files = [2, '1', 'hello.txt', 'cgpa.txt', 'education.txt', 'interest.txt', 'background.jpg', 'kitkat.3gpp','demo.html'];

    // Build the Merkle tree and get the root node
    const root = await merkleTree.merkletree(files);
    console.log('Root CID: ', root.cid);
    console.log('\n');

    // CID of a specific transaction to be verified
    const verifyCID = 'QmRw2Mqrmw5apdkgYQejW3kdSz4uEebwijrKvtZrG2BSnR';
    const leafNodeToVerify = merkleTree.getnode(verifyCID);

    // Verify the transaction and check its presence
    if (!leafNodeToVerify) {
        console.log('Transaction is not present');
    } else {
        // Recalculate Merkle root based on the transaction's position in the tree
        const newRootCID = await merkleTree.verify(leafNodeToVerify);
        if (newRootCID === root.cid) {
            console.log('\nTransaction verified and present\n');
        } else {
            console.log('\nTransaction is not present\n');
        }
    }

    // Retrieve a file using its CID from IPFS
    merkleTree.retrieve('QmT9SanPHnSH5AsBqy2xZbstw4rAw5znFPkmjkvDCMdVuF');
    // Print the Merkle tree for visualization
    merkleTree.printTree(root);
})();