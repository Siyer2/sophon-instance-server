# Sophon Instance Server
This is the site the houses the remote computer the students control (i.e. it controls the EC2 instance)

# To run
- Create an IAM role in AWS called awsKeys.json with following permissions: AmazonEC2FullAccess, AmazonSQSFullAccess, AmazonEC2RoleforSSM, AmazonS3FullAccess, AmazonSSMManagedInstanceCore, AmazonSSMFullAccess, An inline policy that allows IAM read-write
- Set deployment environment variable to local, staging or production
- Update config/index.js with your own domain
- npm install
- npm start