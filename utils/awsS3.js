const {s3BucketName,s3BucketRegion,s3AccessKey,s3SecretAccessKey,s3ImageUrlPrefix} = require('../utils/AWSCRED');
const {S3Client, PutObjectCommand, DeleteObjectCommand } = require('@aws-sdk/client-s3');

let s3;

class AwsS3 {

    constructor(){
        if(!s3){
            s3= new S3Client({
                credentials: {
                    accessKeyId: s3AccessKey,
                    secretAccessKey: s3SecretAccessKey
                },
                region: s3BucketRegion
            });
        }
    }

    uploadToS3 = (fileStream, name, ContentType) => {
        const params = {
            Bucket: s3BucketName,
            Key:name,
            Body: fileStream,
            ContentType
        }
        const command = new PutObjectCommand(params);
        return s3.send(command);
    };

    deleteFromS3 = (name) => {
        const params = {
            Bucket: s3BucketName,
            Key:name
        }
        const command = new DeleteObjectCommand(params);
        return s3.send(command);
    }

    static getInstance(){
        return s3;
    }
}

module.exports = AwsS3;