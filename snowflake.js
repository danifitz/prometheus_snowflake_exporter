const snowflake = require('snowflake-sdk');

const flake = (account, username, password, role) => {
    //TODO: implement more options here, like proxy settings, 2FA etc.
    const connection = snowflake.createConnection({
        account,
        username,
        password,
        role
    });

    // const isDate = (date) => {
    //     return (new Date(date) !== "Invalid Date") && !isNaN(new Date(date));
    // }

    const connect = () => {
        return new Promise((resolve, reject) => {
            connection.connect((err => {
                if (err) {
                    reject(err)
                } else {
                    resolve()
                }
            }))
        })
    }

    const query = (statement) => {
        return new Promise((resolve, reject) => {
            connection.execute({
                sqlText: statement,
                complete: (err, stmt, rows) => {
                    if (err) {
                        console.log('fail',stmt);
                        reject(err);
                    } else {
                        resolve(rows);
                    }
                }
            });
        })
    }

    const connected = connect();

    return {
        query: async (statements) => {
            await connected;
            let rows = undefined;
            for (const statement of statements) {
                rows = await query(statement);
            }
            return rows;
        }
    }
}

module.exports = flake;