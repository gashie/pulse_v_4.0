// monitors/monitorEngine.js - Monitor Check Implementations
const axios = require('axios');
const ping = require('ping');
const net = require('net');
const { Client } = require('ssh2');
const Telnet = require('telnet-client');
const https = require('https');
const tls = require('tls');

// Monitor type definitions
const monitorTypes = {
  HTTP: 'http',
  HTTPS: 'https',
  ICMP: 'icmp',
  TCP: 'tcp',
  SSH: 'ssh',
  TELNET: 'telnet',
  SFTP: 'sftp'
};

// ==================== HTTP/HTTPS CHECK ====================

const checkHttp = async (monitor) => {
  const startTime = Date.now();
  
  try {
    const config = {
      method: monitor.method || 'GET',
      url: monitor.url,
      timeout: monitor.timeout || 10000,
      headers: monitor.headers || {},
      validateStatus: () => true,
      maxRedirects: 5
    };
    
    if (monitor.body) {
      config.data = monitor.body;
    }
    
    if (monitor.ignoreTls) {
      config.httpsAgent = new https.Agent({ rejectUnauthorized: false });
    }
    
    const response = await axios(config);
    const responseTime = Date.now() - startTime;
    
    // Check expected status - handle both number and array formats
    let expectedStatus = monitor.expectedStatus || 200;
    if (Array.isArray(expectedStatus)) {
      expectedStatus = expectedStatus[0] || 200;
    }
    const statusOk = response.status === expectedStatus;
    
    // Check expected content
    let contentOk = true;
    if (monitor.expectedContent && statusOk) {
      contentOk = response.data?.toString().includes(monitor.expectedContent);
    }
    
    const isUp = statusOk && contentOk;
    
    // Get SSL info for HTTPS
    let sslInfo = null;
    if (monitor.url?.startsWith('https://')) {
      sslInfo = await getSSLInfo(monitor.url);
    }
    
    return {
      status: isUp ? 'UP' : 'DOWN',
      responseTime,
      message: isUp 
        ? `HTTP ${response.status} OK` 
        : `HTTP ${response.status}${!contentOk ? ' (content mismatch)' : ''}`,
      statusCode: response.status,
      sslInfo
    };
  } catch (error) {
    return {
      status: 'DOWN',
      responseTime: Date.now() - startTime,
      message: error.code || error.message
    };
  }
};

// ==================== GET SSL INFO ====================

const getSSLInfo = (url) => {
  return new Promise((resolve) => {
    try {
      const urlObj = new URL(url);
      const options = {
        host: urlObj.hostname,
        port: urlObj.port || 443,
        servername: urlObj.hostname,
        rejectUnauthorized: false
      };
      
      const socket = tls.connect(options, () => {
        const cert = socket.getPeerCertificate();
        socket.destroy();
        
        if (cert && cert.valid_to) {
          const validTo = new Date(cert.valid_to);
          const daysRemaining = Math.floor((validTo - Date.now()) / (1000 * 60 * 60 * 24));
          
          resolve({
            issuer: cert.issuer?.O || cert.issuer?.CN || 'Unknown',
            validFrom: cert.valid_from,
            validTo: cert.valid_to,
            daysRemaining,
            subject: cert.subject?.CN || urlObj.hostname
          });
        } else {
          resolve(null);
        }
      });
      
      socket.on('error', () => resolve(null));
      socket.setTimeout(5000, () => {
        socket.destroy();
        resolve(null);
      });
    } catch (error) {
      resolve(null);
    }
  });
};

// ==================== ICMP PING CHECK ====================

const checkIcmp = async (monitor) => {
  const startTime = Date.now();
  
  try {
    const result = await ping.promise.probe(monitor.host, {
      timeout: Math.ceil((monitor.timeout || 10000) / 1000)
    });
    
    const responseTime = result.time === 'unknown' ? Date.now() - startTime : parseFloat(result.time);
    
    return {
      status: result.alive ? 'UP' : 'DOWN',
      responseTime: Math.round(responseTime),
      message: result.alive ? `Ping OK (${Math.round(responseTime)}ms)` : 'Host unreachable'
    };
  } catch (error) {
    return {
      status: 'DOWN',
      responseTime: Date.now() - startTime,
      message: error.message
    };
  }
};

// ==================== TCP CHECK ====================

const checkTcp = async (monitor) => {
  const startTime = Date.now();
  
  return new Promise((resolve) => {
    const socket = new net.Socket();
    const timeout = monitor.timeout || 10000;
    
    socket.setTimeout(timeout);
    
    socket.on('connect', () => {
      const responseTime = Date.now() - startTime;
      socket.destroy();
      resolve({
        status: 'UP',
        responseTime,
        message: `TCP connection successful to ${monitor.host}:${monitor.port}`
      });
    });
    
    socket.on('timeout', () => {
      socket.destroy();
      resolve({
        status: 'DOWN',
        responseTime: Date.now() - startTime,
        message: 'Connection timeout'
      });
    });
    
    socket.on('error', (error) => {
      socket.destroy();
      resolve({
        status: 'DOWN',
        responseTime: Date.now() - startTime,
        message: error.code || error.message
      });
    });
    
    socket.connect(monitor.port, monitor.host);
  });
};

// ==================== SSH CHECK ====================

const checkSsh = async (monitor) => {
  const startTime = Date.now();
  
  return new Promise((resolve) => {
    const ssh = new Client();
    const timeout = monitor.timeout || 10000;
    
    const timeoutId = setTimeout(() => {
      ssh.end();
      resolve({
        status: 'DOWN',
        responseTime: Date.now() - startTime,
        message: 'Connection timeout'
      });
    }, timeout);
    
    ssh.on('ready', () => {
      clearTimeout(timeoutId);
      const responseTime = Date.now() - startTime;
      ssh.end();
      resolve({
        status: 'UP',
        responseTime,
        message: `SSH connection successful to ${monitor.host}:${monitor.port || 22}`
      });
    });
    
    ssh.on('error', (error) => {
      clearTimeout(timeoutId);
      resolve({
        status: 'DOWN',
        responseTime: Date.now() - startTime,
        message: error.message
      });
    });
    
    const connectConfig = {
      host: monitor.host,
      port: monitor.port || 22,
      username: monitor.username || 'root',
      readyTimeout: timeout
    };
    
    if (monitor.privateKey) {
      connectConfig.privateKey = monitor.privateKey;
    } else if (monitor.password) {
      connectConfig.password = monitor.password;
    }
    
    ssh.connect(connectConfig);
  });
};

// ==================== SSH COMMAND EXECUTION (with sudo support) ====================

const executeRemoteCommand = async (monitor, command) => {
  const timeout = monitor.timeout || 30000;
  
  return new Promise((resolve) => {
    const ssh = new Client();
    
    const timeoutId = setTimeout(() => {
      ssh.end();
      resolve({ success: false, error: 'Connection timeout' });
    }, timeout);
    
    ssh.on('ready', () => {
      // Check if sudo is needed
      const needsSudo = monitor.sshSudo && command.trim().startsWith('sudo');
      const actualCommand = command;
      
      if (needsSudo && monitor.sshSudoPassword) {
        // Execute with sudo password
        ssh.exec(`echo '${monitor.sshSudoPassword}' | sudo -S ${command.replace(/^sudo\s+/, '')}`, (err, stream) => {
          handleSshStream(err, stream, ssh, timeoutId, resolve);
        });
      } else {
        ssh.exec(actualCommand, (err, stream) => {
          handleSshStream(err, stream, ssh, timeoutId, resolve);
        });
      }
    });
    
    ssh.on('error', (error) => {
      clearTimeout(timeoutId);
      resolve({ success: false, error: error.message });
    });
    
    const connectConfig = {
      host: monitor.host,
      port: monitor.port || 22,
      username: monitor.username || 'root',
      readyTimeout: timeout
    };
    
    if (monitor.privateKey) {
      connectConfig.privateKey = monitor.privateKey;
    } else if (monitor.password) {
      connectConfig.password = monitor.password;
    }
    
    ssh.connect(connectConfig);
  });
};

const handleSshStream = (err, stream, ssh, timeoutId, resolve) => {
  if (err) {
    clearTimeout(timeoutId);
    ssh.end();
    resolve({ success: false, error: err.message });
    return;
  }
  
  let stdout = '';
  let stderr = '';
  
  stream.on('data', (data) => { stdout += data.toString(); });
  stream.stderr.on('data', (data) => { stderr += data.toString(); });
  
  stream.on('close', (code) => {
    clearTimeout(timeoutId);
    ssh.end();
    
    // Filter out sudo password prompt from output
    stdout = stdout.replace(/\[sudo\] password for .+:/, '').trim();
    stderr = stderr.replace(/\[sudo\] password for .+:/, '').trim();
    
    resolve({
      success: code === 0,
      stdout: stdout.trim(),
      stderr: stderr.trim(),
      exitCode: code
    });
  });
};

// ==================== TELNET CHECK ====================

const checkTelnet = async (monitor) => {
  const startTime = Date.now();
  
  try {
    const telnet = new Telnet();
    
    const params = {
      host: monitor.host,
      port: monitor.port || 23,
      timeout: monitor.timeout || 10000,
      negotiationMandatory: false
    };
    
    await telnet.connect(params);
    await telnet.end();
    
    return {
      status: 'UP',
      responseTime: Date.now() - startTime,
      message: `Telnet connection successful to ${monitor.host}:${monitor.port || 23}`
    };
  } catch (error) {
    return {
      status: 'DOWN',
      responseTime: Date.now() - startTime,
      message: error.message
    };
  }
};

// ==================== SFTP CHECK ====================

const checkSftp = async (monitor) => {
  const startTime = Date.now();
  
  return new Promise((resolve) => {
    const ssh = new Client();
    const timeout = monitor.timeout || 10000;
    
    const timeoutId = setTimeout(() => {
      ssh.end();
      resolve({
        status: 'DOWN',
        responseTime: Date.now() - startTime,
        message: 'Connection timeout'
      });
    }, timeout);
    
    ssh.on('ready', () => {
      ssh.sftp((err, sftp) => {
        clearTimeout(timeoutId);
        
        if (err) {
          ssh.end();
          resolve({
            status: 'DOWN',
            responseTime: Date.now() - startTime,
            message: err.message
          });
          return;
        }
        
        // Try to list root directory to verify SFTP works
        sftp.readdir('/', (err2) => {
          ssh.end();
          
          if (err2 && err2.code !== 3) { // code 3 is permission denied, which is ok
            resolve({
              status: 'DOWN',
              responseTime: Date.now() - startTime,
              message: err2.message
            });
            return;
          }
          
          resolve({
            status: 'UP',
            responseTime: Date.now() - startTime,
            message: `SFTP connection successful to ${monitor.host}:${monitor.port || 22}`
          });
        });
      });
    });
    
    ssh.on('error', (error) => {
      clearTimeout(timeoutId);
      resolve({
        status: 'DOWN',
        responseTime: Date.now() - startTime,
        message: error.message
      });
    });
    
    const connectConfig = {
      host: monitor.host,
      port: monitor.port || 22,
      username: monitor.username || 'root',
      readyTimeout: timeout
    };
    
    if (monitor.privateKey) {
      connectConfig.privateKey = monitor.privateKey;
    } else if (monitor.password) {
      connectConfig.password = monitor.password;
    }
    
    ssh.connect(connectConfig);
  });
};

// ==================== MAIN CHECK FUNCTION ====================

const checkMonitorOnce = async (monitor) => {
  const type = monitor.type?.toLowerCase();
  
  switch (type) {
    case 'http':
    case 'https':
      return checkHttp(monitor);
    case 'icmp':
    case 'ping':
      return checkIcmp(monitor);
    case 'tcp':
      return checkTcp(monitor);
    case 'ssh':
      return checkSsh(monitor);
    case 'telnet':
      return checkTelnet(monitor);
    case 'sftp':
      return checkSftp(monitor);
    default:
      return {
        status: 'DOWN',
        responseTime: 0,
        message: `Unknown monitor type: ${type}`
      };
  }
};

// ==================== VALIDATION ====================

const validateMonitorConfig = (config) => {
  const errors = [];
  
  if (!config.name) {
    errors.push('Name is required');
  }
  
  if (!config.type) {
    errors.push('Type is required');
  }
  
  const type = config.type?.toLowerCase();
  
  switch (type) {
    case 'http':
    case 'https':
      if (!config.url) {
        errors.push('URL is required for HTTP/HTTPS monitors');
      }
      break;
    case 'icmp':
    case 'ping':
      if (!config.host) {
        errors.push('Host is required for ICMP monitors');
      }
      break;
    case 'tcp':
      if (!config.host) errors.push('Host is required for TCP monitors');
      if (!config.port) errors.push('Port is required for TCP monitors');
      break;
    case 'ssh':
    case 'sftp':
      if (!config.host) errors.push('Host is required');
      if (!config.username) errors.push('Username is required');
      if (!config.password && !config.privateKey) {
        errors.push('Password or private key is required');
      }
      break;
    case 'telnet':
      if (!config.host) errors.push('Host is required for Telnet monitors');
      break;
    default:
      errors.push(`Unknown monitor type: ${type}`);
  }
  
  return {
    valid: errors.length === 0,
    errors
  };
};

module.exports = {
  checkMonitorOnce,
  validateMonitorConfig,
  executeRemoteCommand,
  monitorTypes,
  getSSLInfo
};
